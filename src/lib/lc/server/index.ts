import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AnthropicAIProvider } from '../agent/anthropic';
import type { AIProvider } from '../agent/provider';
import { mockAIProvider } from '../agent/provider';
import { SupabaseStore } from '../store/supabase';

/**
 * Server-side helpers for the route handlers. The service-role key never
 * reaches the browser; it lets the public intake endpoint write a lead into
 * the right organisation after validating the org's intake token.
 */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function serverStore(): SupabaseStore | null {
  const c = serviceClient();
  return c ? new SupabaseStore(c) : null;
}

/** Anthropic when a key is configured, otherwise the deterministic mock. */
export function aiProvider(): AIProvider {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicAIProvider() : mockAIProvider;
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function bad(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}
