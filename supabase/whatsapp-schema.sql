-- ANX WhatsApp bot — conversation memory for the automated WhatsApp
-- Business agent (src/lib/whatsapp/, /api/whatsapp/webhook).
--
-- Run this once in the Supabase project's SQL Editor, alongside schema.sql
-- and crm-schema.sql.
--
-- Trust model: the webhook runs on the server with the service-role key
-- (SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS. The policies below only
-- exist so a signed-in admin can read the transcripts from the CRM later;
-- the anon key gets no access at all — these tables hold customer phone
-- numbers and full chat history.

create extension if not exists "pgcrypto";

-- One row per WhatsApp customer (phone number). Carries everything the bot
-- learns during the chat so it never asks twice, plus the link to the CRM
-- lead once one exists.
create table if not exists public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Customer's WhatsApp id — international digits, no plus ("9725XXXXXXXX").
  wa_id text not null unique,
  -- Profile name WhatsApp reports; the customer may give a different one.
  profile_name text not null default '',
  -- Detected conversation language ("he" / "ru" / ...), updated as they write.
  language text not null default '',
  -- Bot-side pipeline status, matching the sales flow the prompt defines.
  status text not null default 'new'
    check (status in (
      'new',            -- ליד חדש
      'awaiting_photo', -- ממתין לתמונה
      'quote_sent',     -- הצעת מחיר נשלחה
      'awaiting_reply', -- ממתין לתשובה
      'interested',     -- מעוניין
      'booked',         -- תור נקבע
      'not_relevant',   -- לא רלוונטי
      'needs_human'     -- דורש נציג אנושי
    )),
  -- While true the bot stays silent and a human runs the conversation.
  human_takeover boolean not null default false,
  -- The CRM lead this chat feeds (public.leads), once the bot created one.
  lead_id uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Full transcript, one row per message in either direction.
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  -- WhatsApp message id (wamid...). Unique so webhook retries de-duplicate
  -- on insert instead of answering the same customer twice. Null for the
  -- bot's own outbound messages that never got an id back.
  wamid text unique,
  role text not null check (role in ('user', 'assistant')),
  -- Plain text of the message. Media arrives as a short placeholder
  -- ("[תמונה]") — the binary itself is only held in memory for the turn
  -- that answers it.
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists wa_messages_conversation_idx
  on public.wa_messages (conversation_id, created_at);

-- Reuses set_updated_at() from schema.sql; recreated so this file also runs
-- standalone on a fresh project.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists wa_conversations_set_updated_at on public.wa_conversations;
create trigger wa_conversations_set_updated_at
  before update on public.wa_conversations
  for each row execute function public.set_updated_at();

alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;

drop policy if exists "admin read wa conversations" on public.wa_conversations;
create policy "admin read wa conversations"
  on public.wa_conversations for select
  to authenticated
  using (true);

drop policy if exists "admin update wa conversations" on public.wa_conversations;
create policy "admin update wa conversations"
  on public.wa_conversations for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin read wa messages" on public.wa_messages;
create policy "admin read wa messages"
  on public.wa_messages for select
  to authenticated
  using (true);

-- Bot business knowledge — price list, service area, working hours — lives
-- in crm_settings under this key so the admin can edit it without a deploy.
-- Seeded with the only price the business has published (the ₪299 anchor
-- from the landing page). Services without a price make the bot ask for a
-- photo / hand off instead of inventing a number, so fill this in!
insert into public.crm_settings (key, value)
values (
  'whatsapp_bot',
  jsonb_build_object(
    'businessName', 'ANX ניקוי ריפודים',
    'serviceArea', '',
    'workStartHour', 9,
    'workEndHour', 19,
    'workDays', jsonb_build_array(0, 1, 2, 3, 4, 5),
    'slotMinutes', 120,
    'notes', 'המחיר הסופי נקבע לפי תמונה. אין להתחייב להסרת כתם ב-100%.',
    'priceList', jsonb_build_array(
      jsonb_build_object('service', 'ניקוי ספה תלת-מושבית', 'price', 299,
        'note', 'כולל ניקוי עמוק, טיפול בכתמים, חיטוי וייבוש מואץ'),
      jsonb_build_object('service', 'ניקוי ספה פינתית', 'price', null,
        'note', 'לפי תמונה — תלוי גודל ומצב'),
      jsonb_build_object('service', 'ניקוי מזרן', 'price', null, 'note', 'לפי תמונה'),
      jsonb_build_object('service', 'ניקוי שטיח', 'price', null, 'note', 'לפי תמונה'),
      jsonb_build_object('service', 'ניקוי כיסאות', 'price', null, 'note', 'לפי כמות'),
      jsonb_build_object('service', 'ניקוי מזגן', 'price', null, 'note', ''),
      jsonb_build_object('service', 'ניקוי רכב', 'price', null, 'note', '')
    )
  )
)
on conflict (key) do nothing;
