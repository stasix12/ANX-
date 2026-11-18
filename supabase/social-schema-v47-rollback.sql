-- ─── ביטול v47 ───────────────────────────────────────────────────────────
--
-- מחזיר את העמודה הריקה. שום קוד לא קורא אותה מאז 4.88.0 — הרצפה יושבת
-- ב-social_settings תחת 'comment-auto-since' — ולכן זה משחזר מבנה ולא
-- התנהגות. הערכים שהיו בה אינם חוזרים.
-- ---------------------------------------------------------------------------

alter table public.social_campaigns
  add column if not exists comment_auto_since timestamptz;

do $$
begin
  raise notice 'v47 בוטל: comment_auto_since קיימת שוב, וריקה.';
end $$;
