import type { Locator, Page } from 'playwright-core';
import { fb, firstVisible, patterns } from './selectors';
import { classifyPage } from './session';

/**
 * Reads what a group's own page says about it, so the dashboard can show the
 * same avatar Facebook shows and the discovery screen can tell the owner
 * whether they are in the group. Read-only: no clicks, no typing, no forms.
 *
 * Two entry points:
 *   readGroupProfile() — name + picture. The hot path: every new publishing
 *     target goes through it once (worker/social-worker.ts syncGroupProfiles).
 *   readGroupDetails() — the same, plus membership, member count, privacy and
 *     the page's canonical group id. Slower, because each of the extra reads
 *     has to wait to be sure something is ABSENT, and used only for the
 *     discovery pass the owner opted into.
 *
 * Both return null for a login page or a security checkpoint. That is not an
 * error and carries no message — the caller stops and lets the job path report.
 */

export interface GroupProfile {
  name: string;
  /** Raw picture bytes (Facebook CDN links expire, so the caller stores a copy). */
  image: { bytes: Buffer; contentType: string } | null;
}

/** What the owner is to this group, as far as the PAGE says. Never a guess. */
export type GroupMembership = 'MEMBER' | 'NOT_MEMBER' | 'JOIN_REQUEST_SENT' | 'UNKNOWN';
export type GroupPrivacy = 'public' | 'private' | 'unknown';

export interface GroupDetails extends GroupProfile {
  membership: GroupMembership;
  /** null unless the page printed a full, unabbreviated number. */
  membersCount: number | null;
  privacy: GroupPrivacy;
  /** The numeric id from the page's canonical link, '' when it did not say. */
  canonicalId: string;
}

/* -------------------------------------------------------------- reading */

/** Opens the group and reports whether the page is usable. */
async function openGroup(page: Page, groupUrl: string): Promise<boolean> {
  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);
  return (await classifyPage(page)) === 'ok';
}

async function readName(page: Page): Promise<string> {
  return (await page.title().catch(() => ''))
    .replace(/^\(\d+\)\s*/, '')
    .replace(patterns.titleSuffix, '')
    .trim();
}

async function readPicture(page: Page): Promise<GroupProfile['image']> {
  // The picture: a centred square screenshot of the rendered cover area.
  // Facebook draws a blurred copy behind the real cover and serves both as
  // images, so picking a file is unreliable — what the screen shows is the
  // real thing, and a centre crop is exactly how the Facebook app builds a
  // group's small icon.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const box = await page
    .evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
      const boxes = imgs
        .map((img) => {
          const r = img.getBoundingClientRect();
          const style = getComputedStyle(img);
          return { x: r.left, y: r.top, w: r.width, h: r.height, round: /50%|9999/.test(style.borderRadius) };
        })
        .filter((b) => b.w >= 300 && b.h >= 120 && b.y >= 0 && b.y < 700 && !b.round)
        .sort((a, b) => b.w * b.h - a.w * a.h);
      return boxes[0] ?? null;
    })
    .catch(() => null);

  let image: GroupProfile['image'] = null;
  if (box) {
    const side = Math.min(box.h, box.w, 640);
    const clip = { x: Math.round(box.x + (box.w - side) / 2), y: Math.round(box.y + (box.h - side) / 2), width: Math.round(side), height: Math.round(side) };
    try {
      const bytes = await page.screenshot({ clip, type: 'png', timeout: 15_000 });
      image = { bytes, contentType: 'image/png' };
      console.log(`[worker]    תמונת קבוצה: צילום ${clip.width}×${clip.height} מהקאבר`);
    } catch {
      image = null;
    }
  }
  if (!image) {
    // Fallback: the page's own og:image.
    const og = await page.locator('meta[property="og:image"]').first().getAttribute('content').catch(() => null);
    if (og) {
      try {
        const res = await page.request.get(og, { timeout: 20_000 });
        if (res.ok()) image = { bytes: await res.body(), contentType: res.headers()['content-type'] ?? 'image/jpeg' };
      } catch {
        /* no picture */
      }
    }
  }
  return image;
}

export async function readGroupProfile(page: Page, groupUrl: string): Promise<GroupProfile | null> {
  if (!(await openGroup(page, groupUrl))) return null;
  const name = await readName(page);
  return { name, image: await readPicture(page) };
}

/* ------------------------------------------------------- membership read */

/** Budgets, in ms. Each probe has to wait to be sure an element is ABSENT. */
const COMPOSER_MS = 5_000;
const JOIN_MS = 2_500;
const PENDING_MS = 2_500;

async function anyVisible(candidates: Locator[], timeout: number): Promise<boolean> {
  return (await firstVisible(candidates, timeout)) !== null;
}

/**
 * What the owner is to this group — from what the page shows, and nothing else.
 *
 * MEMBER: a post composer inside [role="main"]. In practice only a member gets
 *   one. NOT clicked — profile.ts never clicks anything.
 * JOIN_REQUEST_SENT: a "request sent" / "cancel request" control.
 * NOT_MEMBER: an actual join CONTROL, matched with an anchored name so the
 *   prose "הצטרפו לקבוצה כדי לראות…" on a teaser page does not count.
 * UNKNOWN: everything else, and there is a lot of it — a group that only
 *   admins post in shows no composer, and a preview page for a group the owner
 *   is not in may show neither composer nor join button. A missing composer is
 *   NOT evidence of non-membership and is never reported as such.
 *
 * The order matters and is safe: a member's page carries no join or pending
 * control, so finding the composer first is decisive.
 */
async function readMembership(page: Page): Promise<GroupMembership> {
  const main = page.locator('[role="main"]');
  // Restricted to the main region on purpose: the left rail and the
  // "suggested for you" tray carry composers and join buttons belonging to
  // OTHER groups, and a page-wide match would label this group by one of them.
  const composer = [
    main.getByRole('button', { name: patterns.composerTrigger }),
    main.getByText(patterns.composerTrigger).first(),
  ];
  if (await anyVisible(composer, COMPOSER_MS)) return 'MEMBER';
  if (await anyVisible(fb.joinPending(page), PENDING_MS)) return 'JOIN_REQUEST_SENT';
  if (await anyVisible(fb.joinButton(page), JOIN_MS)) return 'NOT_MEMBER';
  return 'UNKNOWN';
}

/* --------------------------------------------------- members and privacy */

/** How much of the page text to look at. The header is at the top; the rest is feed. */
const HEADER_TEXT_CHARS = 4000;

/**
 * A thousands-grouped or plain integer, and nothing else. "1.2" is a decimal
 * (an abbreviation Facebook rendered as "1.2K"), not 12, and is rejected —
 * turning it into a number would be inventing one.
 */
function strictInteger(raw: string): number | null {
  const text = raw.trim().replace(/[\u00a0\u202f]/g, ' ').replace(/[\s]+$/, '');
  if (!/^\d+$/.test(text) && !/^\d{1,3}(?:[.,\s]\d{3})+$/.test(text)) return null;
  const digits = text.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * The member count, only when the page printed it in full and printed it once.
 * Two different figures in the header means we read something that is not this
 * group's count (a sidebar, a related group), and two different numbers can
 * only ever produce a wrong one — so that is null too.
 */
function parseMembersCount(text: string): number | null {
  const found = new Set<number>();
  for (const match of text.matchAll(patterns.memberCount)) {
    const n = strictInteger(match[1]);
    if (n !== null) found.add(n);
  }
  return found.size === 1 ? [...found][0] : null;
}

function parsePrivacy(text: string): GroupPrivacy {
  const isPublic = patterns.groupPublic.test(text);
  const isPrivate = patterns.groupPrivate.test(text);
  // Both, or neither, means the page did not say plainly.
  if (isPublic === isPrivate) return 'unknown';
  return isPublic ? 'public' : 'private';
}

async function readHeaderText(page: Page): Promise<string> {
  const main = await page
    .locator('[role="main"]')
    .first()
    .innerText({ timeout: 5_000 })
    .catch(() => '');
  return (main || '').slice(0, HEADER_TEXT_CHARS);
}

/**
 * The group's numeric id, from the page's own canonical link or og:url. This is
 * what lets a group captured by its vanity URL be reconciled with the same
 * group captured by its id — the two look like different groups otherwise.
 */
async function readCanonicalId(page: Page): Promise<string> {
  const hrefs = await Promise.all([
    page.locator('link[rel="canonical"]').first().getAttribute('href').catch(() => null),
    page.locator('meta[property="og:url"]').first().getAttribute('content').catch(() => null),
  ]);
  for (const href of hrefs) {
    const m = href?.match(/\/groups\/(\d{5,})/);
    if (m) return m[1];
  }
  return '';
}

/**
 * Everything readGroupProfile reads, plus membership, member count, privacy and
 * the canonical id. Each extra field is optional by design: 'UNKNOWN' and null
 * are real answers here and are stored as such.
 */
export async function readGroupDetails(page: Page, groupUrl: string): Promise<GroupDetails | null> {
  if (!(await openGroup(page, groupUrl))) return null;

  const name = await readName(page);
  // Membership first, while the page is freshly settled and before the
  // screenshot scrolls it.
  const membership = await readMembership(page);
  const headerText = await readHeaderText(page);
  const canonicalId = await readCanonicalId(page);
  const image = await readPicture(page);

  return {
    name,
    image,
    membership,
    membersCount: parseMembersCount(headerText),
    privacy: parsePrivacy(headerText),
    canonicalId,
  };
}
