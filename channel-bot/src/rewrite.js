// Turns a raw source item into a channel-ready Russian post via the Anthropic API.
// Returns { skip: true } or { skip: false, post: "..." }.

import { config } from '../config.js';

export async function rewriteItem(item) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      system: config.stylePrompt,
      messages: [
        {
          role: 'user',
          content: `Источник: ${item.sourceId}\nСсылка: ${item.link || 'нет'}\n\nИсходный материал:\n${item.text.slice(0, 4000)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data.content?.find((b) => b.type === 'text')?.text || '';
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { skip: true };

  try {
    const parsed = JSON.parse(json);
    if (parsed.skip || !parsed.post) return { skip: true };
    return { skip: false, post: String(parsed.post).trim() };
  } catch {
    return { skip: true };
  }
}
