-- 0093 · Curation gains a memory, a nuke, and (belatedly) a lock.
--
-- REJECT: the queue used to be "every public kit not yet listed" — passing
-- over a kit meant seeing it again on every visit. `review = 'rejected'`
-- remembers the pass; the kit itself is untouched (still public, share
-- link still works) — it just stops asking. Admins can restore a rejected
-- kit to the queue (review → null) or list it outright (listing clears
-- review).
--
-- DELETE: spam and abuse need an exit that isn't a euphemism. The admin
-- delete policy removes the row entirely — doc, share link, likes (FK
-- cascade). The UI double-confirms and reserves it for garbage.
--
-- LOCK: 0089 revoked-then-granted update(listed) for role `authenticated`,
-- but column grants are role-wide and the own-row update policy admits the
-- owner — so a maker could self-curate with a hand-written API call. A
-- trigger closes it for BOTH curation columns: only admins move them.
-- (Service-role and SQL-editor writes carry no auth.uid() and pass — they
-- are trusted infrastructure: seeds, release desk, admin jobs.)

alter table public.projects add column if not exists review text
  check (review is null or review in ('rejected'));

revoke update (review) on public.projects from anon, authenticated;
grant update (review) on public.projects to authenticated;  -- trigger gates WHO

create or replace function public.guard_curation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- service role / SQL editor
  if (new.listed is distinct from old.listed or new.review is distinct from old.review)
     and not exists (select 1 from public.profiles p
       where p.id = auth.uid() and p.is_admin) then
    raise exception 'curation is admin-only';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_curation on public.projects;
create trigger trg_guard_curation before update on public.projects
  for each row execute function public.guard_curation();

drop policy if exists "projects_admin_delete" on public.projects;
create policy "projects_admin_delete" on public.projects
  for delete using (exists (select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin));

-- verify: as a NON-admin owner, `update projects set listed = true where
-- id = <own kit>` must now raise "curation is admin-only".
