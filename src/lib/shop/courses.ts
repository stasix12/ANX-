'use client';

import { supabase } from '@/lib/supabase';

/**
 * Video courses, backed by Supabase (supabase/courses-schema.sql). Unlike
 * the rest of /shop this is not demo data: codes and lessons live in the
 * database so a code the owner creates works on the buyer's phone.
 */

export const COURSE_BUCKET = 'course-videos';

export interface Lesson {
  id: string;
  title: string;
  videoPath: string;
  position: number;
}

export interface UnlockedCourse {
  slug: string;
  title: string;
  lessons: Lesson[];
}

export interface CourseCode {
  code: string;
  course_slug: string;
  note: string;
  active: boolean;
  uses: number;
  first_used_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export const coursesAvailable = () => !!supabase;

export function videoUrl(path: string): string {
  if (!supabase) return '';
  return supabase.storage.from(COURSE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function redeemCode(code: string): Promise<{ course: UnlockedCourse | null; error: string | null }> {
  if (!supabase) return { course: null, error: 'מערכת הקורסים אינה מחוברת כרגע.' };
  const clean = normalizeCode(code);
  if (!clean) return { course: null, error: 'נא להזין קוד גישה' };
  const { data, error } = await supabase.rpc('redeem_course_code', { p_code: clean });
  if (error) return { course: null, error: 'לא ניתן לבדוק את הקוד כרגע. נסו שוב בעוד רגע.' };
  const rows = (data ?? []) as {
    course_slug: string;
    course_title: string;
    lesson_id: string;
    lesson_title: string;
    video_path: string;
    lesson_position: number;
  }[];
  if (!rows.length) return { course: null, error: 'הקוד אינו תקין או שאינו פעיל' };
  return {
    error: null,
    course: {
      slug: rows[0].course_slug,
      title: rows[0].course_title,
      lessons: rows.map((r) => ({ id: r.lesson_id, title: r.lesson_title, videoPath: r.video_path, position: r.lesson_position })),
    },
  };
}

/** Codes are stored as 10 bare characters; dashes and spaces are for reading only. */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatCode = (code: string) => (code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code);

/** 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L). */
export function newCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
