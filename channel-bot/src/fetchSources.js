// Pulls raw items from configured sources.
// - Public Telegram channels: scraped from their t.me/s/<name> web preview
//   (works without a Telegram account, public channels only).
// - RSS/Atom feeds: minimal tag-level parsing, no dependencies.
// Every item comes back as { sourceId, text, link }.

const UA = 'Mozilla/5.0 (compatible; anx-channel-bot/0.1)';

export async function fetchAllSources(sources) {
  const results = await Promise.allSettled(
    sources.map((src) =>
      src.type === 'telegram' ? fetchTelegramChannel(src.channel) : fetchRss(src.url)
    )
  );

  const items = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      items.push(...r.value);
    } else {
      console.error(`Source failed (${JSON.stringify(sources[i])}):`, r.reason?.message || r.reason);
    }
  });
  return items;
}

async function fetchTelegramChannel(channel) {
  const res = await fetch(`https://t.me/s/${channel}`, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`t.me/s/${channel} -> HTTP ${res.status}`);
  const html = await res.text();

  const items = [];
  // Each post's text sits in <div class="tgme_widget_message_text ...">...</div>.
  const blockRe = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  // Post permalinks look like <a class="tgme_widget_message_date" href="https://t.me/ch/123">.
  const links = [...html.matchAll(/class="tgme_widget_message_date"\s+href="([^"]+)"/g)].map(
    (m) => m[1]
  );

  let m;
  let i = 0;
  while ((m = blockRe.exec(html)) !== null) {
    const text = htmlToText(m[1]);
    if (text.length > 30) {
      items.push({ sourceId: `tg:${channel}`, text, link: links[i] || `https://t.me/${channel}` });
    }
    i++;
  }
  return items;
}

async function fetchRss(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const xml = await res.text();

  const items = [];
  const entryRe = /<(item|entry)[\s>][\s\S]*?<\/\1>/g;
  for (const [entry] of matchAll(entryRe, xml)) {
    const title = tag(entry, 'title');
    const description = tag(entry, 'description') || tag(entry, 'summary') || tag(entry, 'content');
    const link =
      tag(entry, 'link') || entry.match(/<link[^>]*href="([^"]+)"/)?.[1] || '';
    const text = htmlToText([title, description].filter(Boolean).join('\n'));
    if (text.length > 30) {
      items.push({ sourceId: `rss:${url}`, text, link });
    }
  }
  return items;
}

function* matchAll(re, s) {
  let m;
  while ((m = re.exec(s)) !== null) yield m;
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
