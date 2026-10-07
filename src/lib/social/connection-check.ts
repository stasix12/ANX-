/**
 * IS IT US, OR IS IT YOU? — asked out loud, from the screen that was refused.
 *
 * auth-trouble.ts can name most failures from the error object alone. The one
 * it cannot is the emptiest: a refusal with no code, no status and no words,
 * which is what a paused project, a blocked request and a dead key all look
 * like from behind a phone. For that case the screen needs to ASK something,
 * and there is exactly one question worth asking: does the project answer at
 * all, and does it accept the key this website was built with?
 *
 * One request answers both. /auth/v1/health needs no account and no session —
 * it is the sign-in server saying "I am here" — and it passes through the same
 * API gateway that rejects a bad key, with the same status it would reject a
 * sign-in with. So:
 *
 *   it threw          → the request never arrived: no internet, or a wrong host
 *   401 / 403         → the project is up and the KEY is not accepted
 *   500 and up        → the project itself is down, paused, or over its quota
 *   ok                → the door is open and the refusal came from the details
 *
 * THE KEY IS SENT AND NEVER SHOWN. It travels in the apikey header, the way
 * every other request from this site already sends it, and nothing here returns
 * it or puts it in a message. What a verdict carries is the project reference —
 * the subdomain, which is inlined in the JavaScript of every page this site
 * serves and which /api/version already reports on purpose, because "which
 * database am I even on" is a question this product has had to answer before.
 */

export type ConnectionVerdict =
  /** The website was built without Supabase settings at all. */
  | { kind: 'unconfigured' }
  /** The request never arrived anywhere. */
  | { kind: 'unreachable'; project: string }
  /** It answered, and refused the key. */
  | { kind: 'bad-key'; project: string; status: number }
  /** It answered with a failure of its own: paused, over quota, broken. */
  | { kind: 'project-down'; project: string; status: number }
  /** The sign-in server is up and accepts this site's key. */
  | { kind: 'reachable'; project: string };

/**
 * The project reference — `abcdefgh` out of `https://abcdefgh.supabase.co`.
 *
 * Returns the host unchanged when it is not a supabase.co address (a custom
 * domain is legitimate), and '' for anything that is not a URL at all, which is
 * what an unset environment variable looks like after Next inlines it.
 */
export function projectRef(url: string): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return '';
  const host = trimmed.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0];
  if (!host) return '';
  return host.endsWith('.supabase.co') ? host.slice(0, -'.supabase.co'.length) : host;
}

type Fetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number }>;

/**
 * Ask the project whether it is there. Never throws: a diagnosis that can
 * itself fail is one more thing to diagnose.
 */
export async function checkConnection(url: string, key: string, fetcher: Fetcher): Promise<ConnectionVerdict> {
  const project = projectRef(url);
  if (!project || !key) return { kind: 'unconfigured' };
  const base = url.trim().replace(/\/+$/, '');
  try {
    const res = await fetcher(`${base}/auth/v1/health`, { headers: { apikey: key } });
    const status = typeof res?.status === 'number' ? res.status : 0;
    if (res?.ok) return { kind: 'reachable', project };
    if (status === 401 || status === 403) return { kind: 'bad-key', project, status };
    if (status >= 500 || status === 0) return { kind: 'project-down', project, status };
    /*
     * 404 and the other 4xx. The host answered and it is not this key being
     * refused, so the path is wrong — a URL pointing at something that is not a
     * Supabase project. "Down" is the honest reading: nothing here can sign in.
     */
    return { kind: 'project-down', project, status };
  } catch {
    return { kind: 'unreachable', project };
  }
}

/** The verdict, in the language of the person who pressed the button. */
export function verdictText(v: ConnectionVerdict): string {
  switch (v.kind) {
    case 'unconfigured':
      return 'האתר הזה נבנה בלי הגדרות Supabase, ולכן אין לאן להתחבר. צריך להגדיר ב-Vercel את NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY ואז Redeploy.';
    case 'unreachable':
      return `לא הצלחנו להגיע בכלל לשרת (${v.project}). בדקו את האינטרנט בטלפון; אם האינטרנט עובד — הכתובת שהאתר מוגדר אליה לא קיימת.`;
    case 'bad-key':
      return `השרת (${v.project}) עובד, אבל דחה את המפתח שהאתר מחזיק (${v.status}). זאת הסיבה שאי אפשר להיכנס, והסיסמה שלכם בסדר. צריך לעדכן ב-Vercel את NEXT_PUBLIC_SUPABASE_ANON_KEY מ-Supabase → Settings → API Keys ואז Redeploy.`;
    case 'project-down':
      return `הפרויקט ב-Supabase (${v.project}) לא עונה כמו שצריך (${v.status}). לרוב זה פרויקט מושהה או שעבר את המכסה. היכנסו ללוח הבקרה של Supabase, ודאו שהפרויקט פעיל, ונסו שוב.`;
    case 'reachable':
      return `השרת (${v.project}) עובד ומקבל את המפתח של האתר. כלומר הבעיה היא בפרטי הכניסה עצמם: בדקו שהמייל מדויק, ואם צריך — אפסו סיסמה.`;
  }
}
