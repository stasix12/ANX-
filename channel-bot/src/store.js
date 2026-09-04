// Tiny JSON-file persistence: which source items we've already seen and
// which drafts are awaiting the admin's decision. Survives restarts;
// intentionally simple — move to Supabase/SQLite only if this outgrows one file.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'state.json');
const SEEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // forget items after 30 days

let state = load();

function load() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { seen: {}, drafts: {} };
  }
}

function save() {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

export function itemHash(item) {
  return createHash('sha256')
    .update(`${item.sourceId}\n${item.text}`)
    .digest('hex')
    .slice(0, 16);
}

export function isSeen(hash) {
  return Boolean(state.seen[hash]);
}

export function markSeen(hash) {
  state.seen[hash] = Date.now();
  pruneSeen();
  save();
}

function pruneSeen() {
  const cutoff = Date.now() - SEEN_TTL_MS;
  for (const [h, ts] of Object.entries(state.seen)) {
    if (ts < cutoff) delete state.seen[h];
  }
}

export function saveDraft(id, draft) {
  state.drafts[id] = draft;
  save();
}

export function getDraft(id) {
  return state.drafts[id];
}

export function deleteDraft(id) {
  delete state.drafts[id];
  save();
}

export function pendingDraftCount() {
  return Object.keys(state.drafts).length;
}
