-- Existing projects: run after 002. Safe to repeat; no content or permissions are replaced.
begin;

alter table public.content add column if not exists is_urgent boolean not null default false;
alter table public.content add column if not exists urgent_until timestamptz;
alter table public.content drop constraint if exists content_urgent_notice_check;
alter table public.content add constraint content_urgent_notice_check
    check (not is_urgent or (kind = 'announcement' and urgent_until is not null and isfinite(urgent_until)));

create index if not exists content_urgent_listing on public.content (status, is_urgent, urgent_until);
grant insert (is_urgent, urgent_until), update (is_urgent, urgent_until) on public.content to authenticated;
notify pgrst, 'reload schema';

commit;
