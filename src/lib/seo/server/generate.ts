import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  LINK_TARGETS,
  MIN_WORDS,
  REGION,
  SERVICES,
  cityBySlug,
  pricing,
  type CitySlug,
  type Lang,
} from '@/lib/seo/config';
import type { Block, FaqEntry, InternalLink } from '@/lib/seo/types';

/**
 * The content engine: one Claude call per language version.
 *
 * Two decisions shape this module.
 *
 * The model is handed a FACT SHEET built from src/lib/seo/config.ts and is told
 * that it is the only source of business facts. It has no tools and no web
 * access, so there is no channel through which a price, a city or a review
 * could enter an article from anywhere else. Anything it invents anyway is
 * caught afterwards by the deterministic gate in src/lib/seo/quality.ts — the
 * prompt is the first defence, not the only one.
 *
 * The Russian version is generated from the SUBJECT, never from the Hebrew
 * text. Translating Hebrew copy would carry Hebrew search phrasing into
 * Russian, and Russian-speaking Israelis search differently ("химчистка
 * дивана", not a transliteration of "ניקוי ספות"). So the two versions are two
 * independent calls that happen to share a topic_key.
 */

if (typeof window !== 'undefined') {
  throw new Error('seo/server/generate is server-only');
}

/** Model and limits. Streaming is used because articles are long outputs. */
const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 16000;

/**
 * What the model must return.
 *
 * `body` is a flat list of typed blocks rather than a discriminated union: a
 * flat shape survives JSON-schema round-tripping cleanly, and `toBlocks()`
 * below narrows it to the real Block union before anything is stored.
 */
const GeneratedArticle = z.object({
  title: z.string().describe('SEO title, 25-65 characters'),
  meta_description: z.string().describe('Meta description, 70-160 characters'),
  h1: z.string().describe('The single H1 of the page'),
  slug: z
    .string()
    .describe('URL slug: lowercase Latin letters, digits and hyphens only, 3-60 characters'),
  keywords: z
    .array(z.string())
    .describe('Target search phrases, most important first, in the article language'),
  body: z.array(
    z.object({
      type: z.enum(['h2', 'h3', 'p', 'ul']),
      text: z.string().describe('Text for h2, h3 and p. Empty string for ul.'),
      items: z.array(z.string()).describe('List items for ul. Empty array otherwise.'),
    }),
  ),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  internal_links: z.array(z.object({ href: z.string(), anchor: z.string() })),
});

export type GeneratedArticle = z.infer<typeof GeneratedArticle>;

/** Builds the fact sheet. Everything the model may assert, and nothing else. */
function factSheet(lang: Lang, city: CitySlug | null): string {
  const cityInfo = cityBySlug(city);
  const services = SERVICES.map((s) => {
    const name = lang === 'he' ? s.he : s.ru;
    return s.priceFrom === null
      ? `- ${name}: no published price`
      : `- ${name}: from ${s.priceFrom} ${pricing.currency}`;
  }).join('\n');

  return [
    'BUSINESS FACTS — the only facts you may state:',
    'Name: הפתרון המבריק (in Russian text, write it as "ha-Pitaron ha-Mavrik" transliterated, or keep the Hebrew name).',
    'Phone / WhatsApp: 053-5257250',
    'Work: professional deep cleaning of upholstery AT THE CUSTOMER\'S HOME, with professional extraction equipment.',
    `Service area: ${REGION[lang]} only — Beer Sheva, Arad, Dimona, Ofakim.`,
    cityInfo ? `This article targets: ${lang === 'he' ? cityInfo.he : cityInfo.ru}` : 'This article is about the southern region generally, with no single target city.',
    '',
    'Services and prices (prices are STARTING prices):',
    services,
    '',
    `Mandatory price disclaimer, to include verbatim if you mention any price: "${pricing.disclaimer[lang]}"`,
    '',
    'Allowed internal links (use 2-4, choose the relevant ones):',
    LINK_TARGETS.map((t) => `- ${t.href} — suggested anchor: ${lang === 'he' ? t.he : t.ru}`).join('\n'),
  ].join('\n');
}

const HARD_RULES = `
HARD RULES — a violation means the article is discarded:
1. Never invent a price. Quote only the starting prices in the fact sheet, and only as "starting from". For a service with no published price, say the price depends on the item and invite a WhatsApp photo.
2. Never invent a customer review, a testimonial, a customer count, a years-in-business figure, a success rate or any statistic. The business has supplied none.
3. Never promise a guarantee, "100%", "all stains removed", "cheapest" or "best in Israel". Say honestly that most everyday stains respond well and that old or previously mistreated stains may leave a mark.
4. Name ONLY cities in the service area. Never mention Tel Aviv, Jerusalem, Haifa or any other city outside the south, not even as a comparison.
5. Never claim a position in Google, and never write for a search engine over a reader.
6. Use only the internal links listed in the fact sheet. Invent no other path.
7. Do not stuff the target phrase. Write it where it belongs and nowhere else.
8. State the method honestly: hot-water extraction (injection and suction) that pulls dirt out of the depth of the fibres, matched to the fabric type. Do not describe equipment or chemicals you were not told about.
`.trim();

/** Language-specific writing brief. */
function languageBrief(lang: Lang): string {
  if (lang === 'he') {
    return `
Write in NATIVE, modern, human Hebrew. Not translated-sounding, not marketing-robotic.
Address the reader as "אתם" (plural you). Short paragraphs. Concrete and useful.
Avoid the clichés of Israeli cleaning sites ("הפתרון המושלם", "שירות ללא פשרות", "אמינות ומקצועיות").
The target phrases must be the phrases a real Israeli would type into Google.
`.trim();
  }
  return `
Write in NATIVE, modern Russian for the Russian-speaking community IN ISRAEL — not for Russia.
This is NOT a translation of a Hebrew article. Research the subject afresh in Russian:
choose the Russian search phrases a Russian-speaking Israeli would actually type
("химчистка дивана", "чистка матраса на дому", "химчистка мебели Беэр-Шева"),
not transliterations of Hebrew wording. Use the Russian names of the cities
(Беэр-Шева, Арад, Димона, Офаким). Prices stay in shekels (₪).
Where it genuinely helps the reader, you may add the Hebrew term in brackets once.
`.trim();
}

function structureBrief(): string {
  return `
STRUCTURE:
- One H1 only (the h1 field). Do not repeat it as an h2.
- At least four h2 sections, and h3 only inside an h2 section.
- At least ${MIN_WORDS} words of body text.
- Open by answering the reader's actual question in the first paragraph. No warm-up.
- Include one section with practical, honest guidance the reader can act on.
- 3-5 FAQ entries, each a real question with a direct answer. No question answered elsewhere verbatim.
- End the body with a natural invitation to send a photo on WhatsApp for a price — phrased as help, not a slogan.
- The slug must be Latin lowercase with hyphens, even for the Russian article (transliterate).
`.trim();
}

/** Narrows the flat generated blocks to the stored Block union, dropping empties. */
export function toBlocks(raw: GeneratedArticle['body']): Block[] {
  const out: Block[] = [];
  for (const b of raw) {
    if (b.type === 'ul') {
      const items = b.items.map((i) => i.trim()).filter(Boolean);
      if (items.length) out.push({ type: 'ul', items });
      continue;
    }
    const text = b.text.trim();
    if (text) out.push({ type: b.type, text });
  }
  return out;
}

/** Keeps only links the quality gate would accept, so a stray path never reaches it. */
export function sanitizeLinks(raw: InternalLink[]): InternalLink[] {
  const allowed = new Set<string>(LINK_TARGETS.map((t) => t.href));
  const seen = new Set<string>();
  return raw
    .filter((l) => allowed.has(l.href) && l.anchor.trim().length > 0)
    .filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)))
    .slice(0, 4);
}

export function sanitizeFaq(raw: FaqEntry[]): FaqEntry[] {
  return raw
    .map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
    .filter((f) => f.q.length > 0 && f.a.length > 0)
    .slice(0, 6);
}

/** The slug the database will accept as a URL segment. */
export function sanitizeSlug(raw: string, lang: Lang): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const safe = base.length >= 3 ? base : `article-${Date.now()}`;
  // The language lives in the path so the two versions of one subject can never
  // collide on a slug, and so a reader can tell the versions apart by URL.
  return lang === 'he' ? safe : `ru-${safe}`;
}

export type GenerateInput = {
  /** The subject, written in the target language, from the planner. */
  subject: string;
  /** Why this subject was chosen — real GSC phrases, when there are any. */
  rationale: string;
  lang: Lang;
  city: CitySlug | null;
  /** Titles already published or queued, so the model does not repeat one. */
  avoidTitles: string[];
};

/** Set when ANTHROPIC_API_KEY is absent, so callers can report it precisely. */
export class MissingApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set');
    this.name = 'MissingApiKeyError';
  }
}

/**
 * Generates one language version.
 *
 * Streams the response: a full article at this length can take long enough to
 * trip the SDK's non-streaming HTTP timeout, and streaming removes that whole
 * class of failure.
 */
export async function generateArticle(input: GenerateInput): Promise<GeneratedArticle> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();
  const client = new Anthropic();

  const prompt = [
    `Write one SEO article for a sofa- and upholstery-cleaning business in southern Israel.`,
    '',
    `SUBJECT: ${input.subject}`,
    input.rationale ? `WHY THIS SUBJECT: ${input.rationale}` : '',
    '',
    factSheet(input.lang, input.city),
    '',
    HARD_RULES,
    '',
    languageBrief(input.lang),
    '',
    structureBrief(),
    '',
    input.avoidTitles.length
      ? `Do NOT cover ground already covered by these existing articles:\n${input.avoidTitles.map((t) => `- ${t}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { format: zodOutputFormat(GeneratedArticle), effort: 'high' },
    system:
      'You are a senior Israeli SEO content writer who writes for real readers and refuses to invent facts about a client business. You write Hebrew and Russian natively.',
    messages: [{ role: 'user', content: prompt }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error(`model refused: ${message.stop_details?.explanation ?? 'no explanation'}`);
  }

  // messages.stream() does not parse for us; find the JSON text block and
  // validate it against the same schema the model was constrained to.
  const text = message.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('model returned no text block');

  let json: unknown;
  try {
    json = JSON.parse(text.text);
  } catch {
    throw new Error('model output was not valid JSON');
  }
  return GeneratedArticle.parse(json);
}

/** Rough per-article API cost, for the dashboard's cost note. Opus 5.5 rates. */
export const COST_PER_ARTICLE_USD = {
  model: MODEL,
  inputPer1M: 4,
  outputPer1M: 20,
  /** Measured shape of one call: ~1.5K in, ~4K out. */
  estimate: (1500 / 1_000_000) * 4 + (4000 / 1_000_000) * 20,
} as const;
