'use client';

import { useEffect, useState } from 'react';
import { listRecentCommands, listWorkers, resumeNeedsAttention, sendWorkerCommand } from '@/lib/social/client';
import { formatDateTimeHe } from '@/lib/social/time';
import type { SocialWorker, WorkerCommand, WorkerCommandName } from '@/lib/social/types';
import { Button, Card, Notice, useConfirm } from './ui';
import { friendlyMessage } from '@/lib/social/errors';

type Light = { icon: string; label: string; cls: string };

function lightFor(w: (SocialWorker & { online: boolean }) | undefined): Light {
  if (!w || !w.online) return { icon: '🔴', label: 'מנותק — ה-worker לא רץ', cls: 'text-rose-700' };
  if (w.status === 'needs_attention' || w.browser_state === 'needs_auth') return { icon: '🟡', label: 'נדרש אימות / טיפול ידני', cls: 'text-amber-700' };
  if (w.browser_state === 'connected') return { icon: '🟢', label: 'מחובר', cls: 'text-emerald-700' };
  if (w.browser_state === 'disconnected') return { icon: '🔴', label: 'לא מחובר לפייסבוק', cls: 'text-rose-700' };
  return { icon: '🟡', label: 'לא נבדק עדיין', cls: 'text-amber-700' };
}

/**
 * "Facebook Browser" status on the dashboard: the local worker's heartbeat
 * and its Chrome profile's login state, plus the three commands the owner
 * needs (connect / check / disconnect) and the recovery path when Facebook
 * asks for a human.
 */
export function BrowserStatusCard({ onChanged }: { onChanged?: () => void }) {
  const [workers, setWorkers] = useState<(SocialWorker & { online: boolean })[]>([]);
  const [commands, setCommands] = useState<WorkerCommand[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  async function load() {
    try {
      const [w, c] = await Promise.all([listWorkers(), listRecentCommands(3)]);
      setWorkers(w);
      setCommands(c);
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  const worker = workers.find((w) => w.online) ?? workers[0];
  const light = lightFor(worker);
  const lastCommand = commands[0];

  async function send(command: WorkerCommandName) {
    setBusy(command);
    try {
      await sendWorkerCommand(worker?.online ? worker.id : null, command);
      if (command === 'resume') await resumeNeedsAttention();
      await load();
      onChanged?.();
    } catch (err) {
      setError(friendlyMessage(err, 'הפקודה נכשלה.'));
    } finally {
      setBusy(null);
    }
  }

  const needsHuman = worker?.online && (worker.status === 'needs_attention' || worker.browser_state === 'needs_auth');

  return (
    <Card title="Facebook Browser (קבוצות)">
      {error && <div className="mb-2"><Notice tone="error">{error}</Notice></div>}
      <p className={`text-lg font-extrabold ${light.cls}`}>
        {light.icon} {light.label}
      </p>
      <p className="mt-1 text-xs text-mist-500">
        {worker ? (
          <>
            {worker.name} · {worker.host || '—'} · נראה לאחרונה {formatDateTimeHe(worker.last_seen_at)}
            {worker.debug_mode && ' · Debug (חלון גלוי)'}
          </>
        ) : (
          <>
            עדיין לא הופעל worker. במחשב שלכם: <code dir="ltr">npm run social-worker</code>
          </>
        )}
      </p>
      {needsHuman && (
        <div className="mt-3">
          <Notice tone="warn">
            <strong>Facebook דורש פעולה ידנית.</strong> {worker?.attention_message || 'פתחו את חלון הדפדפן של ה-worker (או לחצו "התחבר לפייסבוק"), טפלו באימות, ואז "בדוק שוב".'}
          </Notice>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button busy={busy === 'login'} disabled={!worker?.online} onClick={() => send('login')}>
          התחבר לפייסבוק
        </Button>
        <Button variant="secondary" busy={busy === 'check'} disabled={!worker?.online} onClick={() => send('check')}>
          {needsHuman ? 'בדוק שוב' : 'בדוק חיבור'}
        </Button>
        {needsHuman && (
          <Button variant="secondary" busy={busy === 'resume'} onClick={() => send('resume')}>
            המשך קמפיין
          </Button>
        )}
        <Button
          variant="danger"
          busy={busy === 'logout'}
          disabled={!worker?.online}
          onClick={async () => {
            const ok = await confirm.ask({
              title: 'לנתק את הדפדפן?',
              body: 'פרופיל Chrome המקומי — כולל ההתחברות שלכם לפייסבוק — יימחק מהמחשב. תצטרכו להתחבר שוב לפני הפרסום הבא בקבוצות.',
              confirmLabel: 'נתק ומחק פרופיל',
              danger: true,
            });
            if (ok) send('logout');
          }}
        >
          נתק
        </Button>
      </div>
      {lastCommand && (
        <p className="mt-2 text-xs text-mist-500">
          פקודה אחרונה: {lastCommand.command} · {lastCommand.status}
          {lastCommand.result ? ` · ${lastCommand.result}` : ''}
        </p>
      )}
      {confirm.dialog}
      {!worker?.online && (
        <p className="mt-2 text-xs text-mist-500">"התחבר לפייסבוק" פותח חלון Chrome אמיתי על המחשב שמריץ את ה-worker; אתם מתחברים בעצמכם, והמערכת לא רואה סיסמה.</p>
      )}
    </Card>
  );
}
