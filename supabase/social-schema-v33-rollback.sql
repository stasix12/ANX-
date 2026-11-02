-- Rollback of v33 — back to ONE WAITING PUBLICATION PER GROUP, account-wide.
--
-- IT REFUSES RATHER THAN CLEARING THE WAY, and that is the whole design of
-- this file. The v20 index cannot be created while any group holds more than
-- one waiting publication, and the only way to create it anyway is to take
-- rows the owner is waiting on OUT of the open statuses. v20 was entitled to
-- do that on first application: at that moment those rows were the same post
-- queued twice and could never have published. Under v33 a second waiting row
-- is something the owner deliberately asked to be possible, so marking it
-- skipped would be this script deciding which of his campaigns loses its place
-- in line. "אסור למחוק מידע" covers that.
--
-- So: if the data already fits the strict rule, it is restored. If it does
-- not, nothing is changed and the script names the groups in the way and the
-- two honest options — wait for the queue to drain and run it again, or run
-- v20, which does collapse them and says so in its own notice.
--
-- NOTE THAT RESTORING THIS INDEX REVERSES A DECISION THE OWNER MADE IN WORDS,
-- not a default: "לפתוח הכל, גם אותו פוסט", 02.11.2026. Run it only because he
-- has said so again.
--
-- SAFE TO RUN TWICE, and safe to run when it cannot do its job.

do $$
declare
  blocking integer;
  worst    text;
begin
  select count(*) into blocking
    from (
      select target_id
        from public.social_queue
       where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing')
       group by target_id
      having count(*) > 1
    ) t;

  if blocking > 0 then
    select string_agg(name, ', ')
      into worst
      from (
        select coalesce(tg.name, q.target_id::text) as name
          from public.social_queue q
          left join public.social_targets tg on tg.id = q.target_id
         where q.status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing')
         group by coalesce(tg.name, q.target_id::text)
        having count(*) > 1
         limit 8
      ) s;

    raise notice 'v33 rollback: לא בוצע. ל-% קבוצות ממתין יותר מפרסום אחד, ולכן האינדקס המחמיר לא יכול להיווצר.', blocking;
    raise notice 'הקבוצות: %', coalesce(worst, '—');
    raise notice 'שתי אפשרויות: לחכות שהתור יתנקה ולהריץ שוב, או להריץ את v20 — שמסמן את הכפילויות כדולגו ואומר זאת.';
    raise notice 'שום דבר לא שונה. התור שלם.';
    return;
  end if;

  create unique index if not exists social_queue_one_open_per_target_idx
    on public.social_queue (target_id)
    where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing');

  raise notice 'v33 rollback: הוחזר. לכל קבוצה שוב יכול להמתין פרסום אחד בלבד — גם בין קמפיינים שונים.';
end $$;

select
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'social_queue_one_open_per_target_idx') as "ההגבלה חזרה (1 = כן)";
