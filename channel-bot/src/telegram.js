// Thin wrapper over the Telegram Bot API (long polling, no dependencies).

import { config } from '../config.js';

const API = `https://api.telegram.org/bot${config.botToken}`;

async function call(method, params = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.status}`);
  return data.result;
}

export function sendMessage(chatId, text, extra = {}) {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
}

export function editMessageText(chatId, messageId, text, extra = {}) {
  return call('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra });
}

export function answerCallbackQuery(id, text) {
  return call('answerCallbackQuery', { callback_query_id: id, text }).catch(() => {});
}

export function getUpdates(offset) {
  return call('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
}

export function getMe() {
  return call('getMe');
}
