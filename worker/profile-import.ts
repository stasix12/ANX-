import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/*
 * מביא את פרופיל הפייסבוק אל שרת שאין לו מסך ואין לו SSH.
 *
 * THE PROBLEM THIS SOLVES. A cloud container's volume starts empty. The whole
 * point of moving the EXISTING profile (docs/CLOUD-WORKER.md) is that a known
 * session continuing from a new address raises far fewer security checks than
 * a fresh login from a datacenter. On a VPS you copy the folder in with
 * docker cp — but the owner runs this product from a phone, and a managed
 * host (Railway, Render) has no way in at all.
 *
 * So the dashboard gains an upload card (ProfileUploadCard): zip the profile
 * folder on the PC where it lives today, upload it from that PC's browser,
 * and the worker — wherever it runs — picks it up on its next start.
 *
 * IT IS A CREDENTIAL IN TRANSIT AND IS TREATED AS ONE:
 *   - the bucket is private and row-scoped (supabase/social-profiles-bucket.sql):
 *     each user can only touch <their own uid>/..., so one customer can never
 *     download another's session;
 *   - the object is DELETED in the same run that imports it. The cloud holds
 *     the session for the minutes between upload and the worker's next poll,
 *     not a minute longer;
 *   - an existing profile is NEVER overwritten. A signed-in identity already
 *     on this machine wins; replacing it from a stale zip would sign the
 *     browser OUT. To replace deliberately: "נתק" on the dashboard first.
 */
const BUCKET = 'social-profiles';
const OBJECT = 'facebook-profile.zip';

export async function importProfileFromCloud(db: SupabaseClient): Promise<boolean> {
  if (existsSync(env.profileDir)) return false;

  const { data: userData } = await db.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return false;

  const objectPath = `${uid}/${OBJECT}`;
  const { data, error } = await db.storage.from(BUCKET).download(objectPath);
  if (error || !data) return false; /* nothing waiting — the normal case */

  console.log('[worker] נמצא פרופיל פייסבוק שהועלה דרך לוח הבקרה — מייבא...');
  mkdirSync(env.stateDir, { recursive: true });
  const zipPath = path.join(env.stateDir, 'facebook-profile.import.zip');
  const tmpDir = path.join(env.stateDir, 'facebook-profile.import');
  rmSync(tmpDir, { recursive: true, force: true });
  writeFileSync(zipPath, Buffer.from(await data.arrayBuffer()));

  try {
    const res = spawnSync('unzip', ['-q', '-o', zipPath, '-d', tmpDir], { stdio: 'pipe' });
    if (res.error || res.status !== 0) {
      const detail = res.error ? String(res.error) : (res.stderr?.toString('utf8').trim() || `exit ${res.status}`);
      throw new Error(`פתיחת קובץ הפרופיל נכשלה (${detail}). ודאו שהועלה קובץ ZIP של תיקיית facebook-profile.`);
    }
    /*
     * The zip holds either the folder itself (facebook-profile/...) or its
     * bare contents — both are what a person plausibly zips. One directory
     * and nothing else at the top level means "the folder itself".
     */
    const entries = readdirSync(tmpDir);
    const onlyDir = entries.length === 1 && statSync(path.join(tmpDir, entries[0])).isDirectory() ? path.join(tmpDir, entries[0]) : null;
    const src = onlyDir ?? tmpDir;
    mkdirSync(path.dirname(env.profileDir), { recursive: true });
    renameSync(src, env.profileDir);
  } finally {
    rmSync(zipPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }

  /* Used once, gone — the cloud is a courier here, not a safe. */
  await db.storage.from(BUCKET).remove([objectPath]).catch(() => undefined);
  console.log('[worker] הפרופיל יובא ונמחק מהענן — הדפדפן ימשיך מהסשן הקיים.');
  return true;
}
