'use client';

import { useState } from 'react';
import {
  AI_POST_KINDS,
  AI_POST_SERVICES,
  AI_POST_TONES,
  AI_TOPIC_MAX,
  AI_SERVICE_MAX,
  CUSTOM_SERVICE,
  type AiPostKind,
  type AiPostService,
  type AiPostTone,
} from '@/lib/social/ai-post';
import { callSocialApi } from '@/lib/social/client';
import { friendlyMessage } from '@/lib/social/errors';
import { CheckIcon, ClipboardListIcon, PencilIcon, RepeatIcon, SparklesIcon } from '@/components/icons';
import { Field, Notice, inputClass } from './ui';

/**
 * ─── THE AI POST GENERATOR ─────────────────────────────────────────────────
 *
 * Built to a screenshot the owner sent as a binding specification: the mode
 * switch, the robot card, three selects on one row, the optional topic, the
 * full-width gradient button, and the result card with its three actions.
 *
 * TWO THINGS ABOUT ITS PLACE IN THE PRODUCT, and they are what make it safe.
 *
 * 1. IT WRITES TEXT. IT DOES NOT PUBLISH. The generated post goes into the
 *    base_text field this card already had, through `onAccept`, and from
 *    there it travels the path it has always travelled — groups, campaigns,
 *    scheduling, the queue, the library. There is no second publishing
 *    engine here and nothing in this file knows what a queue is.
 *
 * 2. SWITCHING MODES KEEPS WHAT IS WRITTEN. "המעבר בין המצבים חייב להיות
 *    מיידי, ללא רענון עמוד וללא מחיקת תוכן שהמשתמש כבר כתב." The mode is one
 *    piece of state in the parent and the textarea is never unmounted, so a
 *    half-written post survives a trip to the AI tab and back. The generated
 *    result is held HERE, so it also survives a trip to the manual tab — a
 *    person who looks at their own draft and comes back has not lost the
 *    version the model wrote.
 */

/**
 * What the screen is doing right now. One value, so two cannot disagree.
 *
 * `failed` carries the SENTENCE rather than a code, because the route already
 * chose it: every failure there answers with a Hebrew message tailored to its
 * cause — the missing key names the exact Vercel setting, a rate limit says to
 * wait a minute, a refusal says to re-word. callSocialApi() hands that
 * sentence through as the error's message, classified. A second enum here
 * would be a copy of the server's reasoning that could drift from it.
 */
type Phase = { state: 'idle' } | { state: 'working' } | { state: 'failed'; message: string } | { state: 'done' };

export function AiPostComposer({
  onAccept,
  hasText,
  initialResult,
}: {
  /**
   * Hands the chosen text to the editor's own base_text field. The parent
   * decides what that means; this component never writes a post anywhere.
   */
  onAccept: (text: string) => void;
  /** True when the editor's text box already has something in it. */
  hasText: boolean;
  /**
   * TEST SEED, AND NOTHING IN THE APP PASSES IT.
   *
   * The result card is the half of this component with the most to go wrong
   * on a phone — three actions, a version chooser and the handoff — and it
   * only exists after a model call. worker/test/render-ai-post.tsx renders
   * the real component in that state by seeding it, so the geometry measured
   * is the real component's and not a replica's. PostEditor never sets it,
   * which is pinned in ai-post.test.ts.
   */
  initialResult?: string;
}) {
  const [kind, setKind] = useState<AiPostKind>(AI_POST_KINDS[0]);
  const [service, setService] = useState<AiPostService>(AI_POST_SERVICES[0]);
  const [serviceOther, setServiceOther] = useState('');
  const [tone, setTone] = useState<AiPostTone>(AI_POST_TONES[0]);
  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<Phase>(initialResult ? { state: 'done' } : { state: 'idle' });
  const [result, setResult] = useState(initialResult ?? '');
  /*
   * EVERY VERSION THIS SITTING PRODUCED, newest last.
   *
   * "יש לאפשר יצירת גרסאות נוספות מבלי למחוק את הגרסה הקודמת, עד שהמשתמש
   *  בוחר להחליף אותה." So a new version does not overwrite the old one in
   *  place: the old text stays in this list, the owner can step back to it,
   *  and only "השתמש בפוסט הזה" replaces what is in the editor.
   */
  const [history, setHistory] = useState<string[]>(initialResult ? [initialResult] : []);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const working = phase.state === 'working';

  async function generate() {
    setPhase({ state: 'working' });
    setCopied(false);
    setEditing(false);
    try {
      const body = await callSocialApi<{ text?: string }>('/api/social/ai/post', {
        body: {
          kind,
          service,
          ...(service === CUSTOM_SERVICE ? { serviceOther } : {}),
          tone,
          ...(topic.trim() ? { topic: topic.trim() } : {}),
          /* The model's own earlier answers, so "צור גרסה נוספת" differs. */
          ...(history.length ? { previous: history.slice(-3) } : {}),
        },
      });
      const text = (body.text ?? '').trim();
      /* A 200 with no text is a failure, not an empty post: showing a blank
         result card would look like the model had nothing to say. */
      if (!text) {
        setPhase({ state: 'failed', message: 'שירות הכתיבה החזיר תשובה ריקה. נסו שוב.' });
        return;
      }
      setResult(text);
      setHistory((h) => [...h, text]);
      setPhase({ state: 'done' });
    } catch (err) {
      setPhase({ state: 'failed', message: friendlyMessage(err, 'יצירת הפוסט נכשלה. נסו שוב.') });
    }
  }

  const canGenerate = !working && (service !== CUSTOM_SERVICE || serviceOther.trim().length > 0);

  return (
    <div className="mt-4">
      {/*
        THE ROBOT CARD. A tinted panel, not a white one: it is an explanation,
        and on a screen of white cards an explanation that looks like a card
        reads as another form to fill in.
      */}
      <div className="flex items-start gap-3 rounded-tile border border-brand-300/30 bg-brand-300/8 p-3">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-brand-500 text-on-brand shadow-[0_4px_12px_-3px_rgba(124,58,237,0.5)]">
          <SparklesIcon className="h-5.5 w-5.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold leading-5 text-brand-400">מחולל פוסטים חכם</p>
          <p className="mt-1 text-[12.5px] leading-[17px] text-mist-300">
            כתוב פוסט שיווקי מקצועי בעזרת בינה מלאכותית, מותאם לעסק שלך, לקהל ולמטרה.
          </p>
        </div>
      </div>

      {/*
        THREE SELECTS. `sm:grid-cols-3` and not a fixed row: at 390px three
        dropdowns side by side give each one ~110px, which truncates every
        Hebrew label in the lists. One per line on a phone, three across from
        the small breakpoint up — which is what the reference shows on a wide
        screen and what a thumb needs on a narrow one.
      */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <Field label="סוג הפוסט">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as AiPostKind)} disabled={working}>
            {AI_POST_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="תחום / שירות">
          <select className={inputClass} value={service} onChange={(e) => setService(e.target.value as AiPostService)} disabled={working}>
            {AI_POST_SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={CUSTOM_SERVICE}>אחר — שירות משלי…</option>
          </select>
        </Field>
        <Field label="טון כתיבה">
          <select className={inputClass} value={tone} onChange={(e) => setTone(e.target.value as AiPostTone)} disabled={working}>
            {AI_POST_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* The custom service, shown only when it was chosen — a box that is
          always there would be a fourth field for a case most people skip. */}
      {service === CUSTOM_SERVICE && (
        <div className="mt-3">
          <Field label="השירות שלכם" hint="ייכתב בפוסט בדיוק כפי שתכתבו אותו כאן">
            <input
              className={inputClass}
              value={serviceOther}
              maxLength={AI_SERVICE_MAX}
              onChange={(e) => setServiceOther(e.target.value)}
              placeholder="למשל: פוליש לרכב"
              dir="auto"
              disabled={working}
            />
          </Field>
        </div>
      )}

      <div className="mt-3">
        <Field label="נושא / רעיון לפוסט (אופציונלי)" hint="אפשר להשאיר ריק — ייכתב פוסט כללי לשירות שנבחר">
          <input
            className={inputClass}
            value={topic}
            maxLength={AI_TOPIC_MAX}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="מבצע ניקוי ספות בבאר שבע – 299₪"
            dir="auto"
            disabled={working}
          />
        </Field>
      </div>

      {/*
        THE BUTTON. Full width, gradient, 48px — the reference's own shape.
        It is a plain <button> rather than the shared <Button> because no
        variant of that component carries a gradient, and adding one for a
        single call site would put an AI-only skin into the component every
        other screen uses.
      */}
      <button
        type="button"
        onClick={() => void generate()}
        disabled={!canGenerate}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-tile bg-gradient-to-l from-blue-600 to-brand-500 px-4 text-[15px] font-extrabold text-on-brand shadow-[0_4px_14px_-4px_rgba(124,58,237,0.55)] transition-[filter,transform] active:scale-[0.99] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100"
      >
        {working ? (
          <>
            {/* A real loading state, and it says what is happening rather than
                spinning silently — the request takes seconds, not frames. */}
            <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-on-brand/35 border-t-on-brand" />
            כותב את הפוסט…
          </>
        ) : (
          <>
            <SparklesIcon aria-hidden className="h-4.5 w-4.5" />
            {history.length ? 'כתוב פוסט חדש עם AI' : 'כתוב פוסט עם AI'}
          </>
        )}
      </button>

      {phase.state === 'failed' && (
        <div className="mt-3">
          <Notice tone="error">
            {phase.message}{' '}
            <button type="button" className="min-h-11 px-1 font-bold underline" onClick={() => void generate()}>
              נסו שוב
            </button>
          </Notice>
        </div>
      )}

      {/* ───────────── THE RESULT ───────────── */}
      {result && phase.state !== 'working' && (
        <div className="mt-4 rounded-tile border border-ink-700 bg-ink-900/40 p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-brand-400">
            <CheckIcon aria-hidden className="h-4 w-4" />
            תוצאה מוכנה – ניתן לערוך
            {history.length > 1 && (
              <span className="font-bold text-mist-500">· נוסח {history.indexOf(result) + 1} מתוך {history.length}</span>
            )}
          </p>

          {editing ? (
            <textarea
              className={`${inputClass} mt-2 min-h-44`}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              dir="auto"
              aria-label="עריכת הפוסט שנוצר"
            />
          ) : (
            /* whitespace-pre-wrap: the model writes line breaks and they are
               the post's shape. `dir="auto"` so a line that starts with an
               emoji still lays out right-to-left. */
            <p dir="auto" className="mt-2 whitespace-pre-wrap text-[14px] leading-[21px] text-mist-100">
              {result}
            </p>
          )}

          {/*
            TWO ACROSS THEN ONE, UNTIL THERE IS ROOM FOR THREE.

            Measured, not guessed: at 390px the row is 358px wide, so three
            `flex-1` buttons get 114px each — and "צור גרסה נוספת" needs 141px
            with its icon. It wrapped onto two lines inside its own button,
            which is the "טקסט שנחתך" the specification forbids. `basis-[48%]`
            puts two on the first line and the long one on its own, and from
            `sm:` up all three sit on one row as the reference shows.
          */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 [&>*]:min-w-0">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(result).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-ink-700 px-3 text-[13px] font-bold text-mist-100 hover:bg-ink-800"
            >
              <ClipboardListIcon aria-hidden className="h-4 w-4" />
              {copied ? 'הועתק' : 'העתק'}
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-ink-700 px-3 text-[13px] font-bold text-mist-100 hover:bg-ink-800"
            >
              <PencilIcon aria-hidden className="h-4 w-4" />
              {editing ? 'סיום עריכה' : 'ערוך'}
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={!canGenerate}
              className="col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-ink-700 px-3 text-[13px] font-bold text-mist-100 hover:bg-ink-800 disabled:opacity-60 sm:col-span-1"
            >
              <RepeatIcon aria-hidden className="h-4 w-4" />
              צור גרסה נוספת
            </button>
          </div>

          {/* Earlier versions stay reachable — a new one does not delete the
              one before it, which is the whole of "מבלי למחוק את הגרסה
              הקודמת". */}
          {history.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {history.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setResult(h);
                    setEditing(false);
                    setCopied(false);
                  }}
                  className={`min-h-9 rounded-full border px-2.5 text-[12px] font-bold ${
                    h === result ? 'border-brand-300 bg-brand-300/12 text-brand-400' : 'border-ink-700 text-mist-500 hover:bg-ink-800'
                  }`}
                >
                  נוסח {i + 1}
                </button>
              ))}
            </div>
          )}

          {/*
            THE HANDOFF, AND IT IS THE ONLY WAY OUT OF THIS COMPONENT.
            *
            * Nothing above has touched the post. This is the tap that puts the
            * text into the editor's own base_text, after which every existing
            * mechanism — groups, campaigns, scheduling, the queue, the library
            * — behaves exactly as it does for a post typed by hand.
            *
            * It warns before overwriting, because the text box may already
            * hold something the owner wrote and a silent replace is how an
            * afternoon's work disappears.
          */}
          <button
            type="button"
            onClick={() => {
              if (hasText && !window.confirm('הטקסט שכבר כתוב בפוסט יוחלף בנוסח הזה. להמשיך?')) return;
              onAccept(result);
            }}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-tile bg-gradient-to-l from-blue-600 to-brand-500 px-4 text-[14px] font-extrabold text-on-brand shadow-[0_4px_14px_-4px_rgba(124,58,237,0.55)] active:scale-[0.99]"
          >
            <CheckIcon aria-hidden className="h-4.5 w-4.5" />
            השתמש בפוסט הזה
          </button>
          <p className="mt-1.5 text-center text-[11.5px] text-mist-500">
            הטקסט ייכנס לשדה &quot;טקסט בסיסי&quot; וימשיך משם כרגיל — קבוצות, תזמון ופרסום בלי שינוי.
          </p>
        </div>
      )}
    </div>
  );
}
