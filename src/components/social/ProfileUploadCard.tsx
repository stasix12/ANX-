'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, Card } from '@/components/social/ui';

/*
 * מעלים את פרופיל הפייסבוק מהמחשב — בשביל worker שרץ בענן.
 *
 * The card exists for exactly one journey: the publishing engine moves off
 * the owner's PC into a container (docs/CLOUD-WORKER.md), and the signed-in
 * browser profile has to travel with it, because a fresh datacenter login is
 * the thing most likely to trip Facebook's security checks. A managed host
 * has no SSH — but the PC that holds the profile has a browser, and this
 * page is already in it.
 *
 * The flow the text below walks through: close the worker on the PC, zip
 * %USERPROFILE%\.hapitaron-social\facebook-profile, pick the zip here. The
 * worker in the cloud imports it on its next start and deletes it from the
 * bucket (worker/profile-import.ts) — so "הועלה" here means "בדרך", not
 * "נשמר לתמיד".
 *
 * SIZE: a Chrome profile zips to tens, sometimes a couple of hundred, MB.
 * Supabase's default per-object cap is 50MB and a project can raise it; the
 * card states the failure plainly instead of letting a 413 look like a bug.
 */
const BUCKET = 'social-profiles';
const OBJECT = 'facebook-profile.zip';

export function ProfileUploadCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function upload(file: File) {
    if (!supabase) return;
    setBusy(true);
    setNote(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error('לא מחוברים — התחברו מחדש ונסו שוב.');
      const { error } = await supabase.storage.from(BUCKET).upload(`${uid}/${OBJECT}`, file, {
        upsert: true,
        contentType: 'application/zip',
      });
      if (error) {
        /* The two failures a person can actually act on, in their language. */
        const msg = /exceeded|too large|413/i.test(error.message)
          ? 'הקובץ גדול ממגבלת ההעלאה של הפרויקט ב-Supabase. הגדילו את Upload file size limit בהגדרות ה-Storage ונסו שוב.'
          : /bucket.*not.*found/i.test(error.message)
            ? 'דלי האחסון עדיין לא קיים — הריצו את supabase/social-profiles-bucket.sql ונסו שוב.'
            : error.message;
        throw new Error(msg);
      }
      setNote({
        kind: 'ok',
        text: 'הפרופיל הועלה. ה-worker בענן ייקח אותו בהפעלה הבאה שלו, ימחק אותו מהענן וימשיך מהסשן הקיים — בלי התחברות מחדש.',
      });
    } catch (err) {
      setNote({ kind: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <Card
      title="העברת הפרופיל ל-worker בענן"
      subtitle="כשמעבירים את מנוע הפרסום לשרת — הפרופיל המחובר עובר איתו, במקום התחברות חדשה שמקפיצה אימות."
    >
      <ol className="list-decimal space-y-1.5 ps-5 text-sm text-mist-300">
        <li>במחשב שבו המערכת עובדת היום — סוגרים את חלון ה-worker.</li>
        <li>
          דוחסים ל-ZIP את התיקייה{' '}
          <code dir="ltr" className="rounded bg-ink-900/60 px-1.5 py-0.5 text-xs">
            %USERPROFILE%\.hapitaron-social\facebook-profile
          </code>
        </li>
        <li>פותחים את העמוד הזה באותו מחשב ובוחרים את הקובץ כאן.</li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button variant="secondary" busy={busy} onClick={() => fileRef.current?.click()}>
          בחר קובץ ZIP להעלאה
        </Button>
      </div>
      {note && (
        <p className={`mt-2 text-sm ${note.kind === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{note.text}</p>
      )}
      <p className="mt-2 text-xs text-mist-500">
        הקובץ נשמר בתיקייה פרטית שרק החשבון שלכם רואה, ונמחק אוטומטית ברגע שה-worker מייבא אותו. אם במכונה של ה-worker כבר
        קיים פרופיל — הקובץ שהועלה לא ידרוס אותו; נתקו שם קודם.
      </p>
    </Card>
  );
}
