'use client';

import { useEffect, useRef, useState } from 'react';
import { agentGreeting, runAgentTurn, type AgentContext } from '@/lib/lc/agent/engine';
import { useLc } from '@/lib/lc/context';
import type { AgentSettings, AgentState, Attachment, Qualification } from '@/lib/lc/types';
import { emptyAgentState, emptyQualification } from '@/lib/lc/types';
import { BotIcon, CameraIcon, RepeatIcon, SendIcon, UserIcon } from '../icons';
import { Button, cx } from '../ui/primitives';

interface Line {
  from: 'customer' | 'ai';
  text: string;
  photo?: string;
}

/**
 * Sandbox chat against the (unsaved) settings form. Nothing is persisted —
 * it uses the real engine with the real catalogue and calendar so what the
 * owner sees here is exactly what a customer would get.
 */
export function TestChat({ settings, className }: { settings: AgentSettings; className?: string }) {
  const { s, t, locale } = useLc();
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState<Qualification>(emptyQualification);
  const [state, setState] = useState<AgentState>(emptyAgentState);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const ctx = (qq: Qualification, st: AgentState): AgentContext => ({
    organization: s!.organization,
    settings,
    services: s!.services,
    rules: s!.pricingRules,
    bookings: s!.bookings,
    workers: s!.workers,
    customer: { name: { he: 'דנה', ru: 'Ольга', en: 'Sarah' }[locale], phone: '0500000000', city: '', language: locale },
    qualification: qq,
    state: st,
    now: new Date(),
  });

  const reset = () => {
    const g = agentGreeting(ctx(emptyQualification(), emptyAgentState()));
    setLines([{ from: 'ai', text: g.replies[0] }]);
    setQ(emptyQualification());
    setState(g.state);
  };

  useEffect(() => {
    if (s) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.organization.id, settings.languages.join(','), locale]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length, typing]);

  function send(msg: string, photo?: boolean) {
    if (!s || (!msg.trim() && !photo)) return;
    const attachments: Attachment[] = photo ? [{ type: 'image', url: `/lc/photos/item-${1 + Math.floor(Math.random() * 6)}.svg` }] : [];
    setLines((l) => [...l, { from: 'customer', text: msg.trim(), photo: attachments[0]?.url }]);
    setText('');
    setTyping(true);
    setTimeout(() => {
      const turn = runAgentTurn(ctx(q, state), { text: msg.trim(), attachments });
      setQ(turn.qualification);
      setState(turn.state);
      setLines((l) => [...l, ...turn.replies.map((r) => ({ from: 'ai' as const, text: r }))]);
      setTyping(false);
    }, 600);
  }

  const suggestions = { he: ['כמה עולה ניקוי ספה פינתית?', 'אני מרמת גן', 'אתה בוט?'], ru: ['Сколько стоит почистить угловой диван?', 'Я в Холоне', 'Это бот?'], en: ['How much for a 3-seat sofa and a mattress?', "I'm in Tel Aviv", 'Are you a bot?'] }[locale];

  return (
    <div className={cx('flex flex-col overflow-hidden rounded-2xl border border-lc-border bg-white shadow-lc-card', className)}>
      <div className="flex items-center justify-between border-b border-lc-border bg-gradient-to-l from-lc-primary-soft to-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-lc-primary to-lc-violet text-white"><BotIcon className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-bold text-lc-text">{settings.agentName || t('agent.agentName')}</p>
            <p className="text-[11px] text-lc-muted">{t('agent.test')} · {t(`tone.${settings.tone}` as const)}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<RepeatIcon className="h-3.5 w-3.5" />} onClick={reset}>{t('agent.testReset')}</Button>
      </div>
      <div className="lc-scroll h-[420px] space-y-2 overflow-y-auto bg-lc-bg p-4">
        {lines.map((l, i) => (
          <div key={i} className={cx('flex', l.from === 'ai' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed', l.from === 'ai' ? 'lc-bubble-ai' : 'lc-bubble-customer text-lc-text')}>
              {l.photo && <img src={l.photo} alt="" className="mb-1.5 w-40 rounded-lg" />}
              <p className="whitespace-pre-line">{l.text}</p>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-end">
            <div className="lc-bubble-ai inline-flex items-center gap-1 rounded-2xl px-4 py-3">
              <span className="lc-typing-dot h-1.5 w-1.5 rounded-full bg-white" />
              <span className="lc-typing-dot h-1.5 w-1.5 rounded-full bg-white" />
              <span className="lc-typing-dot h-1.5 w-1.5 rounded-full bg-white" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-lc-border p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((sg) => (
            <button key={sg} type="button" onClick={() => send(sg)} className="rounded-full border border-lc-border bg-white px-2.5 py-1 text-[12px] font-medium text-lc-muted hover:border-lc-primary-ring hover:text-lc-primary">
              {sg}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <UserIcon className="h-4 w-4 shrink-0 text-lc-faint" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('agent.testHint')} className="h-10 flex-1 rounded-xl border border-lc-border bg-white px-3 text-sm focus:border-lc-primary focus:outline-none focus:ring-4 focus:ring-lc-primary-ring/60" />
          <button type="button" onClick={() => send(text, true)} className="grid h-10 w-10 place-items-center rounded-xl border border-lc-border text-lc-muted hover:text-lc-text" title={t('inbox.attachPhoto')}>
            <CameraIcon className="h-4 w-4" />
          </button>
          <Button type="submit" size="icon" disabled={!text.trim()} aria-label={t('inbox.send')}>
            <SendIcon className="h-4 w-4 rtl:-scale-x-100" />
          </Button>
        </form>
      </div>
    </div>
  );
}
