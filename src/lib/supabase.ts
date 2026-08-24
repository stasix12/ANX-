import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * `null` until NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are
 * set, so the public storefront (which never needs this) keeps building even
 * before the admin panel's project exists.
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
