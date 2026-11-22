'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { coursesAvailable, formatCode, redeemCode, videoUrl, type UnlockedCourse } from '@/lib/shop/courses';
import { ShopFrame } from '../Chrome';
import { IconLock } from '../icons';
import { btn, inputCls } from '../ui';

const SAVED = 'anx3d-course-code';

/** /shop/course — buyers type the access code they were sent and watch. */
export function CourseView() {
  const [code, setCode] = useState('');
  const [course, setCourse] = useState<UnlockedCourse | null>(null);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = async (value: string, remember = true) => {
    setBusy(true);
    setError(null);
    const r = await redeemCode(value);
    setBusy(false);
    if (!r.course) {
      setError(r.error);
      try {
        if (!remember) localStorage.removeItem(SAVED);
      } catch {}
      return;
    }
    setCourse(r.course);
    setCurrent(0);
    try {
      localStorage.setItem(SAVED, value);
    } catch {}
  };

  // A code used on this device before opens the course straight away.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SAVED);
    } catch {}
    if (saved) {
      setCode(saved);
      void unlock(saved, false);
    }
  }, []);

  const lesson = course?.lessons[current];

  return (
    <ShopFrame nav={false} back="/shop/c/courses">
      <div className="mx-auto max-w-3xl px-4 pt-2 lg:pt-8">
        {!course ? (
          <div className="mx-auto max-w-md pt-6 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-x-blue-50 text-x-blue">
              <IconLock size={30} />
            </span>
            <h1 className="mt-4 text-[24px] font-black">כניסה לקורס</h1>
            <p className="mt-1 text-[14px] text-x-muted">הזינו את קוד הגישה שקיבלתם אחרי הרכישה</p>
            <form
              className="mt-6 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void unlock(code);
              }}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXXX-XXXXX"
                aria-label="קוד גישה"
                dir="ltr"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                className={`${inputCls} text-center font-mono text-[18px] tracking-widest uppercase`}
              />
              {error && (
                <p role="alert" className="rounded-xl bg-[#fdeced] px-4 py-3 text-[14px] font-semibold text-x-red">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy || !coursesAvailable()} className={`${btn.primary} h-14 w-full text-[17px]`}>
                {busy ? 'בודק…' : 'לצפייה בקורס'}
              </button>
            </form>
            <p className="mt-6 text-[13px] text-x-muted">
              עוד לא רכשתם?{' '}
              <Link href="/shop/c/courses" className="font-bold text-x-blue">
                לקורסים
              </Link>
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="text-[22px] font-black lg:text-3xl">{course.title}</h1>
              <button
                type="button"
                onClick={() => {
                  setCourse(null);
                  try {
                    localStorage.removeItem(SAVED);
                  } catch {}
                }}
                className="shrink-0 text-[13px] font-bold text-x-muted"
              >
                יציאה
              </button>
            </div>
            {lesson ? (
              <>
                <div className="mt-4 overflow-hidden rounded-[18px] bg-black">
                  <video
                    key={lesson.id}
                    src={videoUrl(lesson.videoPath)}
                    controls
                    playsInline
                    controlsList="nodownload"
                    onContextMenu={(e) => e.preventDefault()}
                    className="aspect-video w-full bg-black"
                  />
                </div>
                <p className="mt-3 text-[17px] font-extrabold">
                  {course.lessons.length > 1 && <span className="text-x-muted">שיעור {current + 1} · </span>}
                  {lesson.title}
                </p>
                {course.lessons.length > 1 && (
                  <ol className="mt-5 divide-y divide-x-line rounded-2xl ring-1 ring-x-line">
                    {course.lessons.map((l, i) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => setCurrent(i)}
                          aria-current={i === current}
                          className={`flex w-full items-center gap-3 px-4 py-3.5 text-start text-[15px] ${i === current ? 'bg-x-blue-50 font-bold text-x-blue' : 'hover:bg-x-soft-2'}`}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-[13px] font-bold ring-1 ring-x-line">{i + 1}</span>
                          {l.title}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <p className="mt-6 rounded-2xl bg-x-soft p-5 text-[15px]">הסרטונים של הקורס יעלו בקרוב. הקוד שלכם שמור — חזרו לכאן מאוחר יותר.</p>
            )}
            <p className="mt-6 text-[12px] text-x-faint" dir="ltr">
              {formatCode(code.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            </p>
          </div>
        )}
      </div>
    </ShopFrame>
  );
}
