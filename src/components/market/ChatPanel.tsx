'use client';

import { useEffect, useRef, useState } from 'react';
import { addMessage } from '@/lib/market/engine';
import { useCollection } from '@/lib/market/hooks';
import type { Message } from '@/lib/market/types';
import { inputClass } from './ui';

/**
 * In-platform chat between the two sides of a booking. Live over the store's
 * change feed. Phone numbers stay hidden until the job day (the system
 * message says so) — that's the anti-disintermediation stance.
 */
export function ChatPanel({
  bookingId,
  me,
}: {
  bookingId: string;
  me: 'customer' | 'professional';
}) {
  const { rows } = useCollection('messages');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const thread = rows
    .filter((m) => m.bookingId === bookingId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [thread.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft('');
    await addMessage(bookingId, me, text);
    setBusy(false);
  };

  const sendImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => void addMessage(bookingId, me, String(reader.result), 'image');
    reader.readAsDataURL(file);
  };

  const sendLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) =>
      void addMessage(
        bookingId,
        me,
        `📍 המיקום שלי: https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`,
        'location',
      ),
    );
  };

  const bubble = (m: Message) => {
    const mine = m.sender === me;
    if (m.kind === 'system') {
      return (
        <p key={m.id} className="mx-auto my-1 max-w-[85%] rounded-full bg-slate-100 px-3 py-1 text-center text-[11px] text-slate-500">
          {m.body}
        </p>
      );
    }
    return (
      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`my-0.5 max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
            mine ? 'rounded-br-md bg-sky-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
          }`}
        >
          {m.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.body} alt="תמונה בצ'אט" className="max-h-48 rounded-lg" />
          ) : (
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          )}
          <p className={`mt-0.5 text-[10px] ${mine ? 'text-sky-100' : 'text-slate-400'}`}>
            {new Date(m.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-80 flex-col rounded-2xl border border-slate-200 bg-slate-50">
      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        {thread.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">אין הודעות עדיין — אפשר לכתוב כאן</p>
        )}
        {thread.map(bubble)}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-200 bg-white p-2 rounded-b-2xl">
        <button onClick={() => fileRef.current?.click()} className="rounded-full p-2 text-lg hover:bg-slate-100" aria-label="שליחת תמונה">
          📷
        </button>
        <button onClick={sendLocation} className="rounded-full p-2 text-lg hover:bg-slate-100" aria-label="שליחת מיקום">
          📍
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && sendImage(e.target.files[0])}
        />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          placeholder="כתבו הודעה…"
          className={inputClass}
        />
        <button
          onClick={() => void send()}
          disabled={!draft.trim()}
          className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          שלח
        </button>
      </div>
    </div>
  );
}
