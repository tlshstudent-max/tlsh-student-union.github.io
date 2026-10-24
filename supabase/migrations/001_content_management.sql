-- Apply once in a new Supabase project's SQL editor. No credentials belong here.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.staff_members (
    email text primary key check (length(email) <= 254 and email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
    role text not null check (role in ('admin', 'editor')),
    edit_announcements boolean not null default false,
    edit_documents boolean not null default false,
    can_publish boolean not null default false,
    active boolean not null default true,
    updated_at timestamptz not null default now()
);

create table public.content (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('announcement', 'document')),
    title text not null check (length(btrim(title)) between 1 and 160),
    summary text not null default '' check (length(summary) <= 500),
    body text not null default '' check (length(body) <= 20000),
    category text not null check (length(btrim(category)) between 1 and 60),
    department text not null default 'union' check (department in ('union','president','activities','pr','rights','design','docs','general')),
    show_on_home boolean not null default true,
    is_urgent boolean not null default false,
    urgent_until timestamptz,
    date date not null check (date >= '1900-01-01' and date <= '9999-12-31'),
    academic_year text not null default '' check (length(academic_year) <= 20),
    url text check (url is null or (length(url) <= 2048 and url ~ '^https://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$')),
    status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint content_document_source_check check (kind <> 'document' or url is not null or length(btrim(body)) > 0),
    constraint content_urgent_notice_check check (not is_urgent or (kind = 'announcement' and urgent_until is not null and isfinite(urgent_until)))
);
create index content_public_listing on public.content (kind, status, date desc);
create index content_department_listing on public.content (department, status, date desc);
create index content_urgent_listing on public.content (status, is_urgent, urgent_until);

create table public.audit_log (
    id bigint generated always as identity primary key,
    actor_email text not null,
    entity text not null,
    record_id text not null,
    action text not null,
    before_data jsonb,
    after_data jsonb,
    created_at timestamptz not null default now()
);

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
    select auth.uid() is not null and exists (
        select 1 from public.staff_members
        where email = lower(auth.jwt()->>'email') and active and role = 'admin'
    );
$$;

create function private.can_edit(content_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
    select auth.uid() is not null and exists (
        select 1 from public.staff_members where email = lower(auth.jwt()->>'email') and active
        and (role = 'admin' or case content_kind
            when 'announcement' then edit_announcements
            when 'document' then edit_documents else false end)
    );
$$;

create function private.can_publish() returns boolean
language sql stable security definer set search_path = '' as $$
    select auth.uid() is not null and exists (
        select 1 from public.staff_members
        where email = lower(auth.jwt()->>'email') and active and (role = 'admin' or can_publish)
    );
$$;

create function private.stamp_content() returns trigger
language plpgsql set search_path = '' as $$
begin
    new.updated_at := clock_timestamp();
    if tg_op = 'UPDATE' then
        new.version := old.version + 1;
    else
        new.version := 1;
    end if;
    return new;
end;
$$;
create trigger content_stamp before insert or update on public.content
for each row execute function private.stamp_content();

create function private.record_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.audit_log (actor_email, entity, record_id, action, before_data, after_data)
    values (coalesce(auth.jwt()->>'email', 'database setup'), tg_table_name,
        coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'email'), tg_op,
        case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
    return new;
end;
$$;
create trigger content_audit after insert or update on public.content
for each row execute function private.record_change();
create trigger staff_audit after insert or update on public.staff_members
for each row execute function private.record_change();

-- Staff permissions are changed exclusively through this serialized RPC.
-- The last active administrator cannot be disabled or demoted, even concurrently.
create function public.manage_staff(
    member_email text, member_role text,
    allow_announcements boolean, allow_documents boolean,
    allow_publish boolean, member_active boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare normalized_email text := lower(btrim(member_email));
begin
    perform pg_advisory_xact_lock(73450822);
    if not private.is_admin() then
        raise exception 'Only active administrators can manage staff' using errcode = '42501';
    end if;
    if member_role is null or member_role not in ('admin', 'editor')
        or normalized_email is null or length(normalized_email) > 254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        or allow_announcements is null or allow_documents is null
        or allow_publish is null or member_active is null then
        raise exception 'Invalid staff settings' using errcode = '22023';
    end if;
    if (member_role <> 'admin' or not member_active)
        and exists (select 1 from public.staff_members where email = normalized_email and role = 'admin' and active)
        and (select count(*) from public.staff_members where role = 'admin' and active) <= 1 then
        raise exception 'The last active administrator must be retained' using errcode = '23514';
    end if;
    insert into public.staff_members (email, role, edit_announcements, edit_documents, can_publish, active)
    values (normalized_email, member_role, allow_announcements, allow_documents, allow_publish, member_active)
    on conflict (email) do update set role = excluded.role, edit_announcements = excluded.edit_announcements,
        edit_documents = excluded.edit_documents, can_publish = excluded.can_publish,
        active = excluded.active, updated_at = clock_timestamp();
end;
$$;

alter table public.staff_members enable row level security;
alter table public.content enable row level security;
alter table public.audit_log enable row level security;

create policy staff_read on public.staff_members for select to authenticated
using (private.is_admin() or (auth.uid() is not null and email = lower(auth.jwt()->>'email')));
create policy content_public_read on public.content for select to anon, authenticated
using (status = 'published');
create policy content_staff_read on public.content for select to authenticated
using (private.can_edit(kind));
create policy content_staff_insert on public.content for insert to authenticated
with check (private.can_edit(kind) and (status <> 'published' or private.can_publish()));
create policy content_staff_update on public.content for update to authenticated
using (private.can_edit(kind) and (status <> 'published' or private.can_publish()))
with check (private.can_edit(kind) and (status <> 'published' or private.can_publish()));
create policy audit_admin_read on public.audit_log for select to authenticated
using (private.is_admin());

revoke all on public.staff_members, public.content, public.audit_log from anon, authenticated;
grant select on public.content to anon, authenticated;
grant select on public.staff_members, public.audit_log to authenticated;
grant insert (kind, title, summary, body, category, department, show_on_home, is_urgent, urgent_until, date, academic_year, url, status),
      update (kind, title, summary, body, category, department, show_on_home, is_urgent, urgent_until, date, academic_year, url, status)
on public.content to authenticated;

revoke all on function private.is_admin(), private.can_edit(text), private.can_publish(),
    private.stamp_content(), private.record_change() from public;
grant execute on function private.is_admin(), private.can_edit(text), private.can_publish() to authenticated;
revoke all on function public.manage_staff(text, text, boolean, boolean, boolean, boolean) from public;
grant execute on function public.manage_staff(text, text, boolean, boolean, boolean, boolean) to authenticated;

commit;
