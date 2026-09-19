import type { BusinessSettings, Post, Variant } from './types';

/**
 * Turns a post (or one of its variants) into the exact text Meta receives.
 * Used by the preview, the worker and the manual-publishing kit, so what the
 * user sees before approving is byte-for-byte what gets published.
 */
export function renderPostText(post: Pick<Post, 'base_text' | 'phone' | 'whatsapp_url'>, variant?: Pick<Variant, 'text'> | null): string {
  /*
   * Every field is read defensively, and that is not belt-and-braces.
   *
   * This function is called from FOUR places, and two of them are the planner
   * (plan.ts, in both runtimes) — so a single post row that hands back
   * undefined for one of these columns does not break one preview, it throws
   * inside planQueue() and stops planning for EVERY schedule and every post,
   * on every worker tick, with nothing publishing and no error on any screen.
   * The third is the publish path itself. The schema has `phone` and
   * `whatsapp_url` as `not null default ''`, so a well-formed row is safe; a
   * narrowed select, a row from an install whose table predates a column
   * (`create table if not exists` never adds one), or a caller passing a
   * partial post is not. The cost of being wrong here is the whole product
   * silently stopping, and the cost of the guard is nothing.
   */
  const body = ((variant?.text ?? '').trim() || (post.base_text ?? '')).trim();
  const tail: string[] = [];
  const phone = (post.phone ?? '').trim();
  const whatsapp = (post.whatsapp_url ?? '').trim();
  if (phone) tail.push(`📞 ${phone}`);
  if (whatsapp) tail.push(`💬 WhatsApp: ${whatsapp}`);
  return tail.length ? `${body}\n\n${tail.join('\n')}` : body;
}

/** Builds a wa.me link from any Israeli phone spelling. */
export function whatsappUrlFor(phone: string, message = ''): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  const intl = digits.startsWith('972') ? digits : digits.replace(/^0/, '972');
  return `https://wa.me/${intl}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

/** Normalised fingerprint of a publication, for duplicate detection. */
export function dedupeKey(targetId: string, text: string, mediaUrls: string[]): string {
  const normalised = text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();
  return `${targetId}|${normalised}|${[...mediaUrls].sort().join(',')}`;
}

/* ---------------------------------------------------------------------------
 * Variant templates — deterministic, business-specific starting points that
 * the owner edits and approves by hand. No text goes out unapproved.
 * ------------------------------------------------------------------------- */

export interface VariantSeed {
  label: string;
  title: string;
  text: string;
  language: 'he' | 'ru';
}

function serviceKey(service: string): 'sofa' | 'ac' | 'generic' {
  if (/ספ|ריפוד|диван|мебел/i.test(service)) return 'sofa';
  if (/מזג|кондиц/i.test(service)) return 'ac';
  return 'generic';
}

export function generateVariantSeeds(opts: {
  service: string;
  city: string;
  language: 'he' | 'ru';
  business: BusinessSettings;
}): VariantSeed[] {
  const { service, city, language, business } = opts;
  const kind = serviceKey(service);
  const cityHe = city || business.cities[0] || 'באר שבע';
  const cityRu = city || business.cities[0] || 'Беэр-Шева';

  if (language === 'ru') {
    const svc =
      kind === 'sofa' ? 'чистка диванов и мягкой мебели' : kind === 'ac' ? 'чистка кондиционеров' : service;
    return [
      { label: 'A', title: 'קצר', language, text: `${cap(svc)} — ${cityRu} и район. Быстро, качественно, с гарантией. Пишите в WhatsApp 👇` },
      {
        label: 'B',
        title: 'מכירתי',
        language,
        text: `✨ ${cap(svc)} на дому — ${cityRu}!\n\n✅ Профессиональное оборудование\n✅ Удаление пятен и запахов\n✅ Результат виден сразу\n\nСегодня скидка на первый заказ. Запишитесь сейчас — места на неделю заканчиваются.`,
      },
      {
        label: 'C',
        title: 'אישי',
        language,
        text: `Привет, соседи 👋 Меня зовут ${business.name}, я делаю ${svc} в ${cityRu}. Работаю сам, аккуратно и честно — фото до/после присылаю до оплаты. Если нужно освежить дом перед праздниками, напишите мне.`,
      },
      {
        label: 'D',
        title: `מותאם ל${cityHe}`,
        language,
        text: `${cityRu}! ${cap(svc)} с выездом на дом — в вашем районе уже завтра. Позвоните или напишите в WhatsApp, отвечаю быстро.`,
      },
    ];
  }

  const svc = kind === 'sofa' ? 'ניקוי ספות וריפודים' : kind === 'ac' ? 'ניקוי מזגנים' : service;
  const benefit =
    kind === 'sofa'
      ? 'הסרת כתמים, ריחות וקרדית האבק — הספה חוזרת להיות חדשה'
      : kind === 'ac'
        ? 'אוויר נקי, פחות חשמל ובלי ריח של עובש'
        : 'תוצאה מקצועית שרואים מיד';
  return [
    { label: 'A', title: 'קצר', language, text: `${svc} ב${cityHe} והסביבה 🧽 מקצועי, מהיר ובאחריות. הודעה ב-WhatsApp ונקבע לכם תור.` },
    {
      label: 'B',
      title: 'מכירתי',
      language,
      text: `✨ ${svc} עד הבית — ${cityHe}!\n\n✅ ציוד מקצועי\n✅ ${benefit}\n✅ מחיר הוגן וברור מראש\n\nהשבוע מבצע להזמנה ראשונה. התורים מתמלאים — שריינו מקום עכשיו.`,
    },
    {
      label: 'C',
      title: 'אישי',
      language,
      text: `היי שכנים 👋 אני מ${business.name}, עוסק ב${svc} ב${cityHe}. עובד לבד, בקפידה ובכנות — שולח תמונות לפני/אחרי לפני התשלום. אם בא לכם לרענן את הבית, כתבו לי.`,
    },
    {
      label: 'D',
      title: `מותאם ל${cityHe}`,
      language,
      text: `תושבי ${cityHe}! ${svc} עם הגעה עד הבית — כבר מחר באזור שלכם. התקשרו או כתבו ב-WhatsApp, עונה מהר.`,
    },
  ];
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
