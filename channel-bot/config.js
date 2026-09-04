// Central configuration for the channel bot.
// Secrets come from environment variables (see .env.example); everything
// editorial — sources, style, cadence — lives here so it can be tuned in git.

export const config = {
  // --- Secrets / identifiers (env) ---
  botToken: required('TELEGRAM_BOT_TOKEN'),
  // Channel the bot posts to, e.g. "@il_skidki" or a numeric -100... id.
  channelId: required('TELEGRAM_CHANNEL_ID'),
  // Your personal chat with the bot — drafts arrive here for approval.
  adminChatId: required('TELEGRAM_ADMIN_CHAT_ID'),
  anthropicApiKey: required('ANTHROPIC_API_KEY'),

  // --- Content sources ---
  // type "telegram": public channel username, scraped via its t.me/s/ preview page.
  // type "rss": any RSS/Atom feed URL.
  // Add/remove freely; the bot dedupes across runs.
  sources: [
    // Примеры — замените на реальные источники скидок, за которыми следите:
    // { type: 'telegram', channel: 'some_deals_channel' },
    // { type: 'rss', url: 'https://example.com/deals/feed' },
  ],

  // How often to poll sources, in minutes.
  fetchIntervalMinutes: Number(process.env.FETCH_INTERVAL_MINUTES || 30),

  // Max new drafts to send to the admin per fetch cycle (protects you from
  // a flood on the first run against a busy source).
  maxDraftsPerCycle: Number(process.env.MAX_DRAFTS_PER_CYCLE || 5),

  // Anthropic model used for rewriting.
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',

  // --- Editorial voice ---
  // The system prompt that defines the channel's style. Tune it as the
  // channel finds its voice.
  stylePrompt: `Ты — редактор израильского Telegram-канала о скидках, акциях и умном потреблении для русскоязычных жителей Израиля.

Твоя задача: получив исходный материал (пост или новость, часто на иврите или английском), переписать его как короткий пост для канала на русском языке.

Правила стиля:
- Русский язык, живой и дружелюбный, без канцелярита.
- Короткий заголовок с 1 подходящим эмодзи в начале.
- 2–5 строк сути: что за скидка/акция, сколько стоит, до какого числа, где.
- Цены в шекелях пиши как ₪199.
- Ивритские названия магазинов/брендов оставляй в оригинале, при необходимости поясняй в скобках.
- Никаких выдуманных фактов: если в исходнике нет цены или даты — не сочиняй.
- В конце строка "🔗 Подробнее" со ссылкой на источник, если ссылка есть.

Если материал НЕ относится к скидкам, акциям, выгодным ценам или потребительским лайфхакам в Израиле (реклама казино, политика, дубли, пустые посты) — пометь его как skip.

Отвечай СТРОГО в JSON: {"skip": true} или {"skip": false, "post": "текст поста"}.`,
};

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name} (see .env.example)`);
    process.exit(1);
  }
  return v;
}
