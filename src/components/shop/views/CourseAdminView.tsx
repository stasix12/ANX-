'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { signIn, signOut, useAdminSession } from '@/lib/adminAuth';
import { COURSE_BUCKET, formatCode, newCode, videoUrl, type CourseCode } from '@/lib/shop/courses';
import { supabase } from '@/lib/supabase';
import { site } from '@/lib/site';
import { IconTrash, IconUpload } from '../icons';
import { Logo } from '../Logo';
import { btn, inputCls, toast, Toaster } from '../ui';

/**
 * /shop/admin/courses — the owner's course desk: upload lesson videos and
 * create / disable access codes. Uses the same Supabase admin account as
 * /admin; everything is enforced by RLS in supabase/courses-schema.sql.
 */

interface Course {
  slug: string;
  title: string;
}
interface LessonRow {
  id: string;
  course_slug: string;
  position: number;
  title: string;
  video_path: string;
}

const COURSE_URL = `${site.url}/shop/course/`;

function shareText(course: string, code: string) {
  return `תודה שרכשת את ${course}! 🎓\nקוד הגישה שלך: ${formatCode(code)}\nלצפייה: ${COURSE_URL}`;
}

export function CourseAdminView() {
  const { session, loading } = useAdminSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [slug, setSlug] = useState<string>('');
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [codes, setCodes] = useState<CourseCode[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ name: string; busy: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [lastCode, setLastCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const c = await supabase.from('courses').select('slug,title').order('created_at');
    if (c.error) {
      setDbError(
        c.error.code === '42P01' || /does not exist|schema cache/i.test(c.error.message)
          ? 'טבלאות הקורסים עוד לא קיימות. יש להריץ פעם אחת את supabase/courses-schema.sql ב-SQL Editor של Supabase.'
          : c.error.message,
      );
      return;
    }
    setDbError(null);
    const list = (c.data ?? []) as Course[];
    setCourses(list);
    const current = slug || list[0]?.slug || '';
    setSlug(current);
    if (!current) return;
    const [l, k] = await Promise.all([
      supabase.from('course_lessons').select('id,course_slug,position,title,video_path').eq('course_slug', current).order('position').order('created_at'),
      supabase.from('course_codes').select('*').eq('course_slug', current).order('created_at', { ascending: false }),
    ]);
    setLessons((l.data ?? []) as LessonRow[]);
    setCodes((k.data ?? []) as CourseCode[]);
  }, [slug]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  if (!supabase) return <p className="p-10 text-center">המערכת אינה מחוברת ל-Supabase.</p>;
  if (loading) return null;

  if (!session) {
    return (
      <div className="shop-theme grid min-h-dvh place-items-center bg-x-soft-2 px-5">
        <form
          className="w-full max-w-sm space-y-3 rounded-[22px] bg-white p-6 shadow-x-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoginError(await signIn(email, password));
          }}
        >
          <div className="text-center">
            <Logo className="text-[30px]" />
            <h1 className="mt-2 text-[18px] font-black">ניהול קורסים</h1>
            <p className="text-[13px] text-x-muted">כניסה עם חשבון הניהול של האתר</p>
          </div>
          <input aria-label="אימייל" type="email" dir="ltr" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} text-right`} />
          <input aria-label="סיסמה" type="password" dir="ltr" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} text-right`} />
          {loginError && <p className="text-[13px] font-semibold text-x-red">{loginError}</p>}
          <button type="submit" className={`${btn.primary} h-12 w-full`}>
            כניסה
          </button>
        </form>
      </div>
    );
  }

  const course = courses.find((c) => c.slug === slug);

  const uploadLesson = async (file: File) => {
    if (!supabase || !course) return;
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
    // A random folder per file: the address cannot be guessed or listed.
    const path = `${course.slug}/${crypto.randomUUID()}/lesson.${ext}`;
    setUpload({ name: file.name, busy: true });
    const up = await supabase.storage.from(COURSE_BUCKET).upload(path, file, { contentType: file.type || 'video/mp4', upsert: false });
    if (up.error) {
      setUpload(null);
      toast(/size|large|413/i.test(up.error.message) ? 'הקובץ גדול מהמותר בתוכנית של Supabase' : `ההעלאה נכשלה: ${up.error.message}`);
      return;
    }
    const title = file.name.replace(/\.[^.]+$/, '');
    const ins = await supabase.from('course_lessons').insert({ course_slug: course.slug, title, video_path: path, position: lessons.length + 1 });
    setUpload(null);
    if (ins.error) return toast(`שמירת השיעור נכשלה: ${ins.error.message}`);
    toast('הסרטון הועלה');
    void load();
  };

  const createCode = async () => {
    if (!supabase || !course) return;
    const code = newCode();
    const r = await supabase.from('course_codes').insert({ code, course_slug: course.slug, note: note.trim() });
    if (r.error) return toast(`יצירת הקוד נכשלה: ${r.error.message}`);
    setLastCode(code);
    setNote('');
    void load();
  };

  return (
    <div className="shop-theme min-h-dvh bg-x-soft-2 pb-16">
      <header className="sticky top-0 z-30 border-b border-x-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4">
          <Logo className="text-[24px]" />
          <span className="rounded-full bg-x-blue-50 px-3 py-1 text-[12px] font-bold text-x-blue">קורסים</span>
          <Link href="/shop/admin" className="ms-auto text-[13px] font-bold text-x-blue">
            ניהול החנות
          </Link>
          <button type="button" onClick={() => void signOut()} className="text-[13px] font-bold text-x-muted">
            יציאה
          </button>
        </div>
      </header>
      <main id="main" className="mx-auto mt-6 max-w-4xl space-y-6 px-4">
        {dbError && <p className="rounded-2xl bg-[#fdeced] p-4 text-[14px] font-semibold text-x-red">{dbError}</p>}
        {courses.length > 1 && (
          <select value={slug} onChange={(e) => setSlug(e.target.value)} className={`${inputCls} h-11`} aria-label="קורס">
            {courses.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        )}
        {course && (
          <>
            <section className="rounded-[22px] bg-white p-5 shadow-x-card">
              <h2 className="text-[18px] font-black">סרטוני {course.title}</h2>
              <ol className="mt-3 divide-y divide-x-line">
                {lessons.map((l, i) => (
                  <li key={l.id} className="flex items-center gap-2 py-2.5">
                    <span className="w-6 text-[13px] font-bold text-x-muted">{i + 1}</span>
                    <input
                      defaultValue={l.title}
                      aria-label="שם השיעור"
                      onBlur={async (e) => {
                        const title = e.target.value.trim();
                        if (!title || title === l.title || !supabase) return;
                        await supabase.from('course_lessons').update({ title }).eq('id', l.id);
                        toast('השם נשמר');
                      }}
                      className={`${inputCls} h-10 flex-1`}
                    />
                    <a href={videoUrl(l.video_path)} target="_blank" rel="noreferrer" className="text-[13px] font-bold text-x-blue">
                      צפייה
                    </a>
                    <button
                      type="button"
                      aria-label="מחיקת השיעור"
                      onClick={async () => {
                        if (!supabase || !confirm(`למחוק את "${l.title}"?`)) return;
                        await supabase.storage.from(COURSE_BUCKET).remove([l.video_path]);
                        await supabase.from('course_lessons').delete().eq('id', l.id);
                        void load();
                      }}
                      className="grid size-9 place-items-center text-x-muted hover:text-x-red"
                    >
                      <IconTrash size={18} />
                    </button>
                  </li>
                ))}
                {!lessons.length && <li className="py-3 text-[14px] text-x-muted">עוד לא הועלו סרטונים.</li>}
              </ol>
              <label className={`${btn.blue} mt-3 h-12 w-full cursor-pointer`}>
                <IconUpload size={20} />
                {upload?.busy ? `מעלה את ${upload.name}… (אל תסגרו את הדף)` : 'העלאת סרטון'}
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  disabled={!!upload?.busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void uploadLesson(f);
                  }}
                />
              </label>
              <p className="mt-2 text-[12px] text-x-muted">בתוכנית החינמית של Supabase כל קובץ מוגבל ל-50MB. סרטון ארוך — מחלקים לכמה שיעורים או משדרגים תוכנית.</p>
            </section>

            <section className="rounded-[22px] bg-white p-5 shadow-x-card">
              <h2 className="text-[18px] font-black">קודי גישה</h2>
              <div className="mt-3 flex gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="שם הלקוח / מספר הזמנה (לא חובה)" className={`${inputCls} h-12 flex-1`} />
                <button type="button" onClick={() => void createCode()} className={`${btn.primary} h-12 shrink-0 px-5`}>
                  קוד חדש
                </button>
              </div>
              {lastCode && (
                <div className="mt-3 rounded-2xl bg-x-blue-50 p-4 text-center">
                  <p className="text-[13px] text-x-muted">הקוד החדש</p>
                  <p dir="ltr" className="font-mono text-[26px] font-black tracking-widest">
                    {formatCode(lastCode)}
                  </p>
                  <div className="mt-2 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(shareText(course.title, lastCode));
                        toast('ההודעה הועתקה');
                      }}
                      className={`${btn.ghost} h-10 px-4 text-[13px]`}
                    >
                      העתקת הודעה ללקוח
                    </button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(shareText(course.title, lastCode))}`} target="_blank" rel="noreferrer" className={`${btn.blue} h-10 px-4 text-[13px]`}>
                      שליחה בוואטסאפ
                    </a>
                  </div>
                </div>
              )}
              <ul className="mt-4 divide-y divide-x-line">
                {codes.map((c) => (
                  <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                    <span dir="ltr" className={`font-mono text-[15px] font-bold ${c.active ? '' : 'text-x-faint line-through'}`}>
                      {formatCode(c.code)}
                    </span>
                    <span className="text-x-ink-2">{c.note}</span>
                    <span className="ms-auto text-x-muted">
                      {c.first_used_at ? `נכנס ${c.uses} פעמים · אחרון ${new Date(c.last_used_at ?? c.first_used_at).toLocaleDateString('he-IL')}` : 'עוד לא נוצל'}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!supabase) return;
                        await supabase.from('course_codes').update({ active: !c.active }).eq('code', c.code);
                        void load();
                      }}
                      className={`font-bold ${c.active ? 'text-x-red' : 'text-x-green'}`}
                    >
                      {c.active ? 'השבתה' : 'הפעלה'}
                    </button>
                  </li>
                ))}
                {!codes.length && <li className="py-3 text-[14px] text-x-muted">אין עדיין קודים.</li>}
              </ul>
            </section>
          </>
        )}
      </main>
      <Toaster />
    </div>
  );
}
