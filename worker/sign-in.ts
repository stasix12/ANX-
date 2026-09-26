import { createInterface } from 'node:readline/promises';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * SIGNING THIS MACHINE IN, WITHOUT A PASSWORD ANYWHERE.
 *
 * The rule the owner set for Facebook applies here for the same reason: a
 * program should not be the thing you type a password into. It applies harder
 * to a program somebody downloaded, because they cannot read it and have only
 * our word for what it does with what they type.
 *
 * So the machine is signed in the way a phone is: the customer says which
 * email account this is, Supabase emails a six-digit code to that address,
 * and the customer types the code. Whoever can read the mailbox can sign in;
 * whoever cannot, cannot — and nothing that could be reused later is ever
 * typed here or written to a file in the folder.
 *
 * `shouldCreateUser: false` ON PURPOSE. Signing up is something you do on the
 * website, where you can read what you are agreeing to. If this flow created
 * accounts, a typo in an email address would silently make a second, empty
 * account and the customer would sit in front of a dashboard with none of
 * their own data on it, with nothing anywhere saying why.
 *
 * What comes back is a session. supabase-js writes it through the file
 * storage in worker/session-store.ts and refreshes it by itself from then on,
 * so this whole conversation happens exactly once per machine.
 */

const CODE = /^\d{6}$/;

/*
 * A CODE OR THE WHOLE LINK, BECAUSE SUPABASE SENDS WHICHEVER IT IS CONFIGURED
 * TO SEND.
 *
 * The same request produces a six-digit code or a "click here" link depending
 * on one line in the email template — `{{ .Token }}` or `{{ .ConfirmationURL }}`
 * — and the default is the link. Insisting on the code would mean the very
 * first customer is stopped by a setting in a dashboard they have never seen,
 * with the worker saying "the code is 6 digits" at somebody holding an email
 * that contains no digits at all.
 *
 * The link carries the same secret as `token_hash`, so it is accepted too:
 * paste the address, or the code, whichever the email gave you.
 */
export function tokenFrom(input: string): { token: string } | { tokenHash: string } | null {
  const raw = input.trim();
  if (CODE.test(raw.replace(/\s/g, ''))) return { token: raw.replace(/\s/g, '') };
  const inUrl = raw.match(/[?&#]token_hash=([^&\s#]+)/i);
  if (inUrl) return { tokenHash: decodeURIComponent(inUrl[1]) };
  return null;
}

export interface Prompter {
  question(text: string): Promise<string>;
  close(): void;
}

function consolePrompter(): Prompter {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return { question: (text) => rl.question(text), close: () => rl.close() };
}

/**
 * Asks for an email, asks for the code that arrives, and returns once the
 * client holds a session.
 *
 * Throws rather than looping for ever when there is nobody there to answer:
 * a worker started by Windows at boot has no terminal, and a prompt nobody
 * can see would look exactly like a hang.
 */
export async function signInInteractively(
  client: SupabaseClient,
  prompt: Prompter = consolePrompter(),
  attempts = 3,
): Promise<void> {
  /*
   * IS THERE ANYBODY THERE TO ANSWER?
   *
   * A console gives a TTY. The desktop app does not — it starts the worker as
   * a child process and pipes its input, which looks exactly like a service
   * started by Windows at boot. The difference matters: one has a person in
   * front of a window, the other has nobody, and a prompt in the second case
   * is indistinguishable from a hang.
   *
   * So the app says so explicitly, and anything that cannot say so is assumed
   * to be unattended.
   */
  const attended = process.stdin.isTTY || process.env.SOCIAL_WORKER_PROMPTABLE === '1';
  if (!attended) {
    throw new Error(
      'המחשב הזה עדיין לא מחובר לחשבון, ואין חלון לשאול בו.\n' +
        'הפעילו את התוכנה פעם אחת ידנית כדי להתחבר, ואחרי זה היא תזכור.',
    );
  }

  console.log('');
  console.log('  ============================================');
  console.log('    חיבור המחשב הזה לחשבון שלכם');
  console.log('  ============================================');
  console.log('');
  console.log('  נשלח מייל לכתובת שאיתה נרשמתם לאתר — עם קוד או עם קישור.');
  console.log('  אפשר להקליד את הקוד, או להדביק כאן את הקישור. בלי סיסמאות.');
  console.log('');

  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const email = (await prompt.question('  המייל שלכם: ')).trim();
      if (!email.includes('@')) {
        console.log('  זה לא נראה כמו כתובת מייל. נסו שוב.\n');
        continue;
      }

      const sent = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (sent.error) {
        /*
         * Said as it is. "לא הצלחנו לשלוח" with no reason is the message that
         * sends somebody to restart their router when the real answer is that
         * they have not signed up yet.
         */
        console.log(`  לא הצלחנו לשלוח קוד לכתובת הזאת: ${sent.error.message}`);
        console.log('  אם עדיין לא נרשמתם — הרשמו קודם באתר, ואז חזרו לכאן.\n');
        continue;
      }

      console.log('');
      console.log('  שלחנו קוד. אם הוא לא מגיע תוך דקה, בדקו גם בספאם.');
      console.log('');

      for (let tries = 1; tries <= attempts; tries += 1) {
        const answer = await prompt.question('  הקוד מהמייל (או הדביקו את הקישור): ');
        const parsed = tokenFrom(answer);
        if (!parsed) {
          console.log('  לא זיהיתי קוד. הדביקו את 6 הספרות, או את כל הקישור מהמייל.\n');
          continue;
        }
        const verified =
          'token' in parsed
            ? await client.auth.verifyOtp({ email, token: parsed.token, type: 'email' })
            : await client.auth.verifyOtp({ token_hash: parsed.tokenHash, type: 'email' });
        if (!verified.error && verified.data.session) {
          console.log('');
          console.log('  המחשב מחובר. מכאן זה זוכר לבד.');
          console.log('');
          return;
        }
        console.log(`  הקוד לא התקבל: ${verified.error?.message ?? 'לא ידוע'}\n`);
      }
      console.log('  ננסה מהתחלה.\n');
    }
  } finally {
    prompt.close();
  }

  throw new Error('לא הצלחנו לחבר את המחשב לחשבון. הריצו שוב כשיש לכם את המייל פתוח.');
}
