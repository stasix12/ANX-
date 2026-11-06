/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE ANX ASSISTANT — CUTTING THE ROOM AWAY FROM THE CHARACTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "אם הרובוט הקיים מבוסס על תמונות עם רקע מובנה, צור נכסים שקופים מתאימים
 *  תוך שמירה על המראה המקורי. אל תסתפק בהגדרת CSS של background: transparent
 *  אם הרקע כבר מוטמע בתוך התמונה."
 *
 * The nine reference frames are renders of a whole room: a blue wall, a desk,
 * a vignette. `background: transparent` cannot touch any of that — it is
 * pixels. So the room is removed here, once, and what ships is nine PNG-grade
 * alpha cutouts of the character and the things on his desk.
 *
 *   node scripts/anx-cutout.mjs
 *     scripts/anx-reference/scene-0..8.webp   (in,  opaque, as delivered)
 *   → public/social/anx/pose-0..8.webp        (out, alpha, aligned)
 *   → src/components/social/anxPoses.ts       (out, the measurements)
 *
 * ─── HOW THE ROOM IS FOUND ────────────────────────────────────────────────
 *
 * Not by colour — the coffee cup is nearly the colour of the desk, and the
 * robot's white shell carries the same blue cast as the wall. By CONTINUITY:
 * the room is smooth and the character is not. Growth starts on the border
 * and steps from pixel to pixel while the colour barely changes, which walks
 * the whole wall and desk including their gradient, and stops at the
 * silhouette. Two fences keep it honest, and both were put here by a failure:
 *
 *   • the SEED fence — a border pixel far from the border's own median is not
 *     a seed. Frame 8's laptop runs along most of the bottom-right edge, and
 *     without this it became its own "local background" and seeded the growth
 *     that then ate the entire laptop.
 *
 *   • the BRIGHTNESS fence — the room lives within a band of the border's
 *     median. The laptop's lid is lit by a rim that ramps from the wall over
 *     a dozen pixels, so every single step along it is under the tolerance;
 *     the fence is what the ramp cannot cross.
 *
 * Then the leak repair: eroding the background mask snaps any one-or-two
 * pixel neck, so a pocket that was only reachable through a soft edge — the
 * inside of the coffee cup — stops counting as room. Only SMALL pockets are
 * given back: the gaps between the wisps of steam are pockets too, and those
 * are honestly room.
 *
 * ─── AND WHY THE POSES ARE THEN MOVED ─────────────────────────────────────
 *
 * The nine frames are not one camera. Measured on the cap, the character is
 * 25% wider in frame 8 than in frame 2 and sits 28 pixels to the right. Played
 * in sequence that is a lurch, which is exactly the "קפיצות" the brief
 * forbids. So every pose is scaled and moved until the cap lands in the same
 * place, and what the browser cross-fades is one character breathing rather
 * than nine photographs of one.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const IN = (i) => join(HERE, 'anx-reference', `scene-${i}.webp`);
const OUT = (i) => join(ROOT, 'public', 'social', 'anx', `pose-${i}.webp`);
const DATA = join(ROOT, 'src', 'components', 'social', 'anxPoses.ts');

const FRAMES = 9;

/* Tuned against all nine frames, every value by looking at the result. */
const TOL = 11; // per-step colour change the growth may follow
const SEED_DEV = 30; // how far a border pixel may sit from its neighbours
const GLOBAL_DEV = 70; // …and from the border's own median, to be a seed
const GROW_DEV = 70; // how far the growth may wander from that median
const ERODE = 2; // neck width the leak repair snaps
const POCKET_CAP = 2600; // the largest pocket handed back (the cup's inside)

/*
 * The canvas every pose is rendered into, and where the cap is put on it.
 * NOT CHOSEN — COMPUTED: with the cap normalised to 140px the widest pose
 * reaches 203px left of it, 225 right, 71 above and 195 below, so anything
 * smaller than this clips a hand or the top of the cap; a few pixels are
 * added on every side so rounding cannot put one back. Same 1.60 shape the
 * reference's own frames have.
 */
const W = 440;
const H = 276;
const CAP_W = 140; // target cap width — the mean of the nine
const CAP_X = 210; // where the cap's centre lands
const CAP_Y = 76;

const idx = (w, x, y) => y * w + x;

function erodeMask(mask, w, h, r) {
  // Outside the frame counts as room: the wall continues past the crop.
  const t = new Uint8Array(w * h);
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let on = 1;
      for (let d = -r; d <= r && on; d++) {
        const nx = x + d;
        if (nx >= 0 && nx < w && !mask[idx(w, nx, y)]) on = 0;
      }
      t[idx(w, x, y)] = on;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let on = 1;
      for (let d = -r; d <= r && on; d++) {
        const ny = y + d;
        if (ny >= 0 && ny < h && !t[idx(w, x, ny)]) on = 0;
      }
      o[idx(w, x, y)] = on;
    }
  return o;
}

function dilateMask(mask, w, h, r) {
  const t = new Uint8Array(w * h);
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let d = -r; d <= r && !on; d++) {
        const nx = x + d;
        if (nx >= 0 && nx < w && mask[idx(w, nx, y)]) on = 1;
      }
      t[idx(w, x, y)] = on;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let d = -r; d <= r && !on; d++) {
        const ny = y + d;
        if (ny >= 0 && ny < h && t[idx(w, x, ny)]) on = 1;
      }
      o[idx(w, x, y)] = on;
    }
  return o;
}

/** Everything in `mask` that still reaches the edge of the frame. */
function reachable(mask, w, h) {
  const keep = new Uint8Array(w * h);
  const q = [];
  const push = (x, y) => {
    const p = idx(w, x, y);
    if (mask[p] && !keep[p]) {
      keep[p] = 1;
      q.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (q.length) {
    const p = q.pop();
    const x = p % w;
    const y = (p / w) | 0;
    if (x + 1 < w) push(x + 1, y);
    if (x > 0) push(x - 1, y);
    if (y + 1 < h) push(x, y + 1);
    if (y > 0) push(x, y - 1);
  }
  return keep;
}

/** Connected components of a boolean mask, as arrays of pixel indices. */
function components(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let k0 = 0; k0 < w * h; k0++) {
    if (!mask[k0] || seen[k0]) continue;
    const c = [k0];
    seen[k0] = 1;
    for (let i = 0; i < c.length; i++) {
      const p = c[i];
      const x = p % w;
      const y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = idx(w, nx, ny);
        if (mask[np] && !seen[np]) {
          seen[np] = 1;
          c.push(np);
        }
      }
    }
    out.push(c);
  }
  return out;
}

const median = (a) => {
  const s = [...a].sort((p, q) => p - q);
  return s[s.length >> 1];
};

/** One frame, room removed, as an RGBA buffer the size of the source. */
async function cut(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const C = info.channels;
  const at = (x, y) => (y * w + x) * C;

  const ring = [];
  for (let x = 0; x < w; x++) ring.push([x, 0]);
  for (let y = 1; y < h; y++) ring.push([w - 1, y]);
  for (let x = w - 2; x >= 0; x--) ring.push([x, h - 1]);
  for (let y = h - 2; y > 0; y--) ring.push([0, y]);
  const lum = ring.map(([x, y]) => {
    const i = at(x, y);
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  });
  const ringMed = median(lum);

  let bg = new Uint8Array(w * h);
  const q = [];
  const R = 30;
  for (let k = 0; k < ring.length; k++) {
    const lo = Math.max(0, k - R);
    const hi = Math.min(ring.length, k + R);
    if (Math.abs(lum[k] - median(lum.slice(lo, hi))) > SEED_DEV) continue;
    if (Math.abs(lum[k] - ringMed) > GLOBAL_DEV) continue;
    const [x, y] = ring[k];
    const p = idx(w, x, y);
    if (!bg[p]) {
      bg[p] = 1;
      q.push(p);
    }
  }

  while (q.length) {
    const p = q.pop();
    const x = p % w;
    const y = (p / w) | 0;
    const i = at(x, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const np = idx(w, nx, ny);
      if (bg[np]) continue;
      const j = at(nx, ny);
      const d = Math.max(
        Math.abs(data[i] - data[j]),
        Math.abs(data[i + 1] - data[j + 1]),
        Math.abs(data[i + 2] - data[j + 2]),
      );
      if (d > TOL) continue;
      const nl = (data[j] + data[j + 1] + data[j + 2]) / 3;
      if (Math.abs(nl - ringMed) > GROW_DEV) continue;
      bg[np] = 1;
      q.push(np);
    }
  }

  /* The leak repair. */
  const back = dilateMask(reachable(erodeMask(bg, w, h, ERODE), w, h), w, h, ERODE);
  const pocket = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) pocket[k] = bg[k] && !back[k] ? 1 : 0;
  let given = 0;
  for (const c of components(pocket, w, h)) {
    if (c.length > POCKET_CAP) continue;
    for (const p of c) bg[p] = 0;
    given += c.length;
  }

  /*
   * Hard matte → feathered matte, pulled in a shade so no ring of wall colour
   * survives on the silhouette. The blur is two [1 2 1] passes written out by
   * hand: sharp's own blur() at this sigma eats about twenty pixels off a
   * hundred-pixel square — measured — which would have trimmed the robot
   * rather than its fringe.
   */
  const clampGet = (a, x, y) => a[idx(w, Math.min(w - 1, Math.max(0, x)), Math.min(h - 1, Math.max(0, y)))];
  const blur = (src) => {
    const t = new Float32Array(w * h);
    const o = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        t[idx(w, x, y)] = (clampGet(src, x - 1, y) + 2 * clampGet(src, x, y) + clampGet(src, x + 1, y)) / 4;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        o[idx(w, x, y)] = (clampGet(t, x, y - 1) + 2 * clampGet(t, x, y) + clampGet(t, x, y + 1)) / 4;
    return o;
  };
  let matte = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) matte[k] = bg[k] ? 0 : 255;
  matte = blur(blur(matte));

  /*
   * AND WHAT THE CAMERA CUT, FADES.
   *
   * The reference is a crop: the office chair runs off the left of the frame
   * and the desk runs off the bottom, so removing the room leaves those two
   * ending in a straight line in mid-air — a slab, which is the rectangle
   * the brief is about by another name. Anything within this many pixels of
   * the ORIGINAL frame's edge is ramped out, so a cropped object dissolves
   * instead of being guillotined. Nothing that matters is near an edge: the
   * plant, the cup and the character all sit well inside.
   */
  const FADE_LEFT = 18; // the office chair runs off this side
  const FADE_BOTTOM = 18; // and the desk off this one
  const FADE_RIGHT = 10; // the laptop reaches it, so a gentler one
  const FADE_TOP = 0; // NOTHING here: the cap is cropped by the top edge in
  //                     four of the nine frames, and a ramp took the top off
  //                     his hat — seen on a phone before it was measured.
  const ramp = (d, fade) => {
    if (fade <= 0 || d >= fade) return 1;
    const t = d / fade;
    return t * t * (3 - 2 * t); // smoothstep, so the fade has no visible start
  };
  const edgeRamp = (x, y) =>
    Math.min(
      ramp(x, FADE_LEFT),
      ramp(w - 1 - x, FADE_RIGHT),
      ramp(y, FADE_TOP),
      ramp(h - 1 - y, FADE_BOTTOM),
    );

  const rgba = Buffer.alloc(w * h * 4);
  let opaque = 0;
  for (let k = 0; k < w * h; k++) {
    const i = k * C;
    const o = k * 4;
    rgba[o] = data[i];
    rgba[o + 1] = data[i + 1];
    rgba[o + 2] = data[i + 2];
    const a = matte[k];
    const soft = a <= 70 ? 0 : a >= 200 ? 255 : ((a - 70) * 255) / 130;
    const alpha = Math.round(soft * edgeRamp(k % w, (k / w) | 0));
    rgba[o + 3] = alpha;
    if (alpha > 24) opaque++;
  }
  return { rgba, w, h, kept: opaque / (w * h), given };
}

/**
 * Where the cap is. It is the one part of the character that appears in every
 * pose, is always the same object, and is never confused with anything else
 * in the top half of the frame — the laptop is the only other navy mass and
 * it never gets up there.
 */
function capOf({ rgba, w, h }) {
  let y0 = h;
  let y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * 4 + 3] > 24) {
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const limit = y0 + (y1 - y0) * 0.55;
  const dark = new Uint8Array(w * h);
  for (let y = y0; y < limit; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const r = rgba[k * 4];
      const g = rgba[k * 4 + 1];
      const b = rgba[k * 4 + 2];
      if (rgba[k * 4 + 3] > 200 && (r + g + b) / 3 < 78 && b > r) dark[k] = 1;
    }
  let best = [];
  for (const c of components(dark, w, h)) if (c.length > best.length) best = c;
  let sx = 0;
  let x0 = w;
  let x1 = 0;
  for (const p of best) {
    const x = p % w;
    sx += x;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  let sy = 0;
  for (const p of best) sy += (p / w) | 0;
  return { x: sx / best.length, y: sy / best.length, w: x1 - x0 + 1, px: best.length };
}

/**
 * The two eye lights, on the finished pose. Only the frames whose eyes are
 * OPEN report a pair — in the others the character is already smiling with
 * them shut, which is why the blink below only plays on the open ones.
 */
function eyesOf(rgba, w, h) {
  const on = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) {
    const r = rgba[k * 4];
    const g = rgba[k * 4 + 1];
    const b = rgba[k * 4 + 2];
    if (rgba[k * 4 + 3] > 200 && b > 215 && g > 185 && r < 165 && b - r > 70) on[k] = 1;
  }
  const comps = components(on, w, h)
    .filter((c) => c.length > 180)
    .map((c) => {
      let x0 = w;
      let x1 = 0;
      let y0 = h;
      let y1 = 0;
      for (const p of c) {
        const x = p % w;
        const y = (p / w) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      return { n: c.length, x0, x1, y0, y1 };
    })
    /*
     * AN EYE IS ABOUT AS TALL AS IT IS WIDE, AND IT IS UP THERE. The biggest
     * cyan thing in most poses is not an eye at all — it is the glow under
     * the laptop keys, 76 pixels wide and 14 tall across the bottom of the
     * frame. Measured: the eyes come out 23x21 and 18x21.
     */
    .filter((e) => {
      const ew = e.x1 - e.x0 + 1;
      const eh = e.y1 - e.y0 + 1;
      const ratio = eh / ew;
      return ratio > 0.5 && ratio < 2.2 && (e.y0 + e.y1) / 2 < h * 0.62;
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .sort((a, b) => a.x0 - b.x0);
  if (comps.length !== 2) return null;
  /* A pair, or two unrelated glows: eyes sit side by side at the same height
     and are about the same size. Anything else is the keyboard or the pad. */
  const [l, r] = comps;
  const hl = l.y1 - l.y0 + 1;
  const hr = r.y1 - r.y0 + 1;
  if (Math.abs((l.y0 + l.y1) / 2 - (r.y0 + r.y1) / 2) > Math.max(hl, hr) * 0.6) return null;
  if (Math.min(l.n, r.n) / Math.max(l.n, r.n) < 0.45) return null;
  return [l, r].map((e) => ({
    x: Math.round(e.x0),
    y: Math.round(e.y0),
    w: Math.round(e.x1 - e.x0 + 1),
    h: Math.round(e.y1 - e.y0 + 1),
  }));
}

async function main() {
  mkdirSync(dirname(OUT(0)), { recursive: true });
  const cuts = [];
  for (let i = 0; i < FRAMES; i++) {
    const c = await cut(IN(i));
    const cap = capOf(c);
    cuts.push({ ...c, cap });
    console.log(
      `scene-${i}: ${(c.kept * 100).toFixed(1)}% kept, cup/pocket repair ${c.given}px, ` +
        `cap ${cap.w}px wide at ${cap.x.toFixed(0)},${cap.y.toFixed(0)}`,
    );
  }

  const poses = [];
  for (let i = 0; i < FRAMES; i++) {
    const { rgba, w, h, cap } = cuts[i];
    const k = CAP_W / cap.w;
    const nw = Math.round(w * k);
    const nh = Math.round(h * k);
    const left = Math.round(CAP_X - cap.x * k);
    const top = Math.round(CAP_Y - cap.y * k);

    const scaled = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .resize(nw, nh, { kernel: 'lanczos3', fit: 'fill' })
      .raw()
      .toBuffer();

    /* Paste onto the shared canvas by hand: sharp's composite refuses an
       input that hangs off the edge, and several poses do once they are
       moved into place. */
    const canvas = Buffer.alloc(W * H * 4);
    for (let y = 0; y < nh; y++) {
      const cy = y + top;
      if (cy < 0 || cy >= H) continue;
      for (let x = 0; x < nw; x++) {
        const cx = x + left;
        if (cx < 0 || cx >= W) continue;
        const s = (y * nw + x) * 4;
        const d = (cy * W + cx) * 4;
        canvas[d] = scaled[s];
        canvas[d + 1] = scaled[s + 1];
        canvas[d + 2] = scaled[s + 2];
        canvas[d + 3] = scaled[s + 3];
      }
    }

    await sharp(canvas, { raw: { width: W, height: H, channels: 4 } })
      .webp({ quality: 86, alphaQuality: 100, effort: 6 })
      .toFile(OUT(i));

    const eyes = eyesOf(canvas, W, H);
    /*
     * The visor's own colour, read from the bridge BETWEEN the two eyes —
     * glossy near-black with a blue sheen, and never the same twice because
     * every pose is lit differently. The eyelid that closes over an eye is
     * painted in it, so a blink reads as the face, not as a sticker.
     */
    let visor = null;
    if (eyes) {
      const cx = Math.round((eyes[0].x + eyes[0].w + eyes[1].x) / 2);
      const cy = Math.round(eyes[0].y + eyes[0].h / 2);
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = cy - 2; y <= cy + 2; y++)
        for (let x = cx - 2; x <= cx + 2; x++) {
          const o = (y * W + x) * 4;
          if (canvas[o + 3] < 200) continue;
          r += canvas[o]; g += canvas[o + 1]; b += canvas[o + 2]; n++;
        }
      if (n) visor = `#${[r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    }
    poses.push({ eyes, visor });
    console.log(`pose-${i}: scaled ${k.toFixed(3)}, offset ${left},${top}, eyes ${eyes ? 'yes' : 'closed'}`);
  }

  const lines = poses.map(({ eyes, visor }, i) =>
    eyes
      ? `  /* ${i} */ { visor: '${visor}', eyes: [${eyes.map((e) => `{ x: ${e.x}, y: ${e.y}, w: ${e.w}, h: ${e.h} }`).join(', ')}] },`
      : `  /* ${i} */ null,`,
  );
  writeFileSync(
    DATA,
    `/*
 * WHERE THE EYES ARE, measured off the finished poses by scripts/anx-cutout.mjs.
 *
 * Generated. Run \`node scripts/anx-cutout.mjs\` to rebuild this and the nine
 * pose images together; editing it by hand would make it a guess, and the
 * eyelid it positions would land on the robot's cheek.
 *
 * A null means the character's eyes are already shut in that pose — he is
 * smiling with them closed — so there is nothing to blink.
 */
/** One eye light, in the ${W}x${H} pose canvas. */
export type AnxEye = { x: number; y: number; w: number; h: number };
/** A pose whose eyes are open: both lights, left first, and the visor they
    sit on — the colour an eyelid has to be painted to close over them. */
export type AnxFace = { visor: string; eyes: readonly AnxEye[] };

/** The pose canvas every box below is measured in. */
export const POSE_W = ${W};
export const POSE_H = ${H};

export const ANX_FACES: readonly (AnxFace | null)[] = [
${lines.join('\n')}
];
`,
  );
  console.log(`\nwrote ${FRAMES} poses and ${DATA.replace(ROOT + '/', '')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
