import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from './env';

/*
 * WHERE THE SIGNED-IN SESSION LIVES ON THIS MACHINE.
 *
 * The worker has always signed in to Supabase with an email and a password
 * read out of .env.local. That works exactly once — for the person whose
 * password it is. Handing the same folder to a customer hands them the
 * owner's login to the dashboard, the CRM and every lead in it, which is the
 * single thing that makes "download the app" impossible however nicely it is
 * packaged.
 *
 * So the worker learns to hold a SESSION instead of a password: a refresh
 * token it obtained itself, on this machine, from a code the customer typed
 * once. Nothing in the package identifies anybody; the file below is written
 * on first sign-in and is the only thing tying this copy to an account.
 *
 * IT IS A CREDENTIAL AND IS TREATED AS ONE. Outside the repository, under the
 * same hidden folder the Facebook browser profile already uses, and chmod 600
 * so it is not world-readable on a shared machine. On Windows chmod is close
 * to a no-op, which is said here rather than pretended otherwise: the real
 * protection there is the per-user profile directory it sits in.
 *
 * Written through a temporary file and renamed, because a half-written
 * session file is indistinguishable from a corrupt one and would send the
 * worker back to asking for a code — on a machine nobody is standing at.
 */
export function sessionFile(): string {
  return process.env.SOCIAL_WORKER_SESSION_FILE ?? path.join(env.stateDir, 'session.json');
}

type Bag = Record<string, string>;

function readBag(file: string): Bag {
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Bag) : {};
  } catch {
    /*
     * A file we cannot parse is a file we cannot use, and deleting it would
     * throw away the only copy of a credential over what might be a transient
     * read. Treated as "not signed in" instead: the worker asks for a code,
     * and the successful sign-in overwrites it.
     */
    return {};
  }
}

function writeBag(file: string, bag: Bag): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(bag), { mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    /* Windows. The user profile directory is the protection there. */
  }
}

/**
 * The storage adapter supabase-js wants: getItem / setItem / removeItem.
 *
 * Deliberately a plain file rather than the OS keychain. The keychain is
 * better, and it is also a native dependency per platform — the worker is
 * pure JavaScript driving an already-installed Chrome, and keeping it that
 * way is what makes the package tens of megabytes instead of hundreds.
 */
export function fileSessionStorage(file = sessionFile()) {
  return {
    getItem: (key: string): string | null => readBag(file)[key] ?? null,
    setItem: (key: string, value: string): void => {
      const bag = readBag(file);
      bag[key] = value;
      writeBag(file, bag);
    },
    removeItem: (key: string): void => {
      const bag = readBag(file);
      delete bag[key];
      if (Object.keys(bag).length) writeBag(file, bag);
      else if (existsSync(file)) unlinkSync(file);
    },
  };
}

/** Forget this machine's sign-in entirely. Used by "נתק את המחשב הזה". */
export function forgetSession(file = sessionFile()): void {
  if (existsSync(file)) unlinkSync(file);
}
