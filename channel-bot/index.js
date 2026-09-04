// Entry point: runs the fetch→rewrite→approve→publish loop.
//
//   node index.js               — long-running: polls sources on an interval and
//                                 listens for the admin's approve/skip buttons.
//   node index.js --fetch-once  — one fetch cycle, then keeps listening for
//                                 button presses (useful for a first test).

import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { fetchAllSources } from './src/fetchSources.js';
import { rewriteItem } from './src/rewrite.js';
import {
  itemHash,
  isSeen,
  markSeen,
  saveDraft,
  getDraft,
  deleteDraft,
  pendingDraftCount,
} from './src/store.js';
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  getUpdates,
  getMe,
} from './src/telegram.js';

async function fetchCycle() {
  if (config.sources.length === 0) {
    console.log('No sources configured yet — edit config.js to add some.');
    return;
  }

  console.log(`[${new Date().toISOString()}] Fetching ${config.sources.length} source(s)…`);
  const items = await fetchAllSources(config.sources);

  let sent = 0;
  for (const item of items) {
    if (sent >= config.maxDraftsPerCycle) break;
    const hash = itemHash(item);
    if (isSeen(hash)) continue;
    markSeen(hash); // mark first so a crash mid-rewrite can't cause duplicate drafts

    let result;
    try {
      result = await rewriteItem(item);
    } catch (err) {
      console.error('Rewrite failed:', err.message);
      continue;
    }
    if (result.skip) continue;

    const id = randomUUID().slice(0, 8);
    saveDraft(id, { post: result.post, link: item.link, sourceId: item.sourceId });
    await sendMessage(config.adminChatId, `📝 Черновик (${item.sourceId}):\n\n${result.post}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Опубликовать', callback_data: `ap:${id}` },
            { text: '❌ Пропустить', callback_data: `sk:${id}` },
          ],
        ],
      },
    });
    sent++;
  }
  console.log(`Cycle done: ${items.length} item(s) fetched, ${sent} draft(s) sent for approval.`);
}

async function handleCallback(cb) {
  const [action, id] = (cb.data || '').split(':');
  const draft = getDraft(id);
  const { message } = cb;

  if (!draft) {
    await answerCallbackQuery(cb.id, 'Черновик не найден (уже обработан?)');
    return;
  }

  if (action === 'ap') {
    await sendMessage(config.channelId, draft.post);
    deleteDraft(id);
    await answerCallbackQuery(cb.id, 'Опубликовано ✅');
    if (message) {
      await editMessageText(message.chat.id, message.message_id, `✅ ОПУБЛИКОВАНО\n\n${draft.post}`);
    }
  } else if (action === 'sk') {
    deleteDraft(id);
    await answerCallbackQuery(cb.id, 'Пропущено');
    if (message) {
      await editMessageText(message.chat.id, message.message_id, `❌ Пропущено\n\n${draft.post}`);
    }
  }
}

async function handleMessage(msg) {
  // Only the admin may talk to the bot.
  if (String(msg.chat.id) !== String(config.adminChatId)) {
    console.log(`Ignoring message from non-admin chat ${msg.chat.id}`);
    return;
  }
  const text = (msg.text || '').trim();

  if (text === '/start' || text === '/help') {
    await sendMessage(
      msg.chat.id,
      'Я — редакционный бот канала.\n\n' +
        '/status — очередь и настройки\n' +
        '/fetch — собрать источники сейчас\n' +
        '/post <текст> — опубликовать текст в канал напрямую'
    );
  } else if (text === '/status') {
    await sendMessage(
      msg.chat.id,
      `Черновиков в очереди: ${pendingDraftCount()}\n` +
        `Источников: ${config.sources.length}\n` +
        `Интервал сбора: ${config.fetchIntervalMinutes} мин\n` +
        `Канал: ${config.channelId}`
    );
  } else if (text === '/fetch') {
    await sendMessage(msg.chat.id, 'Собираю источники…');
    await fetchCycle().catch((e) => sendMessage(msg.chat.id, `Ошибка: ${e.message}`));
  } else if (text.startsWith('/post ')) {
    await sendMessage(config.channelId, text.slice(6).trim());
    await sendMessage(msg.chat.id, 'Опубликовано ✅');
  }
}

async function pollLoop() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await getUpdates(offset);
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.callback_query) await handleCallback(u.callback_query);
        else if (u.message) await handleMessage(u.message);
      }
    } catch (err) {
      console.error('Poll error:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  const me = await getMe();
  console.log(`Bot @${me.username} is up. Channel: ${config.channelId}`);

  const once = process.argv.includes('--fetch-once');
  await fetchCycle().catch((e) => console.error('Fetch cycle failed:', e.message));
  if (!once) {
    setInterval(
      () => fetchCycle().catch((e) => console.error('Fetch cycle failed:', e.message)),
      config.fetchIntervalMinutes * 60 * 1000
    );
  }

  await pollLoop();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
