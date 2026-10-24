-- Existing projects: run once in Supabase SQL Editor before deploying the new UI.
-- Safe to run again. Existing content, staff, permissions and audit history remain.
begin;

do $$
declare
    add_department boolean := not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'content' and column_name = 'department'
    );
    add_home boolean := not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'content' and column_name = 'show_on_home'
    );
begin
    alter table public.content add column if not exists department text not null default 'union'
        check (department in ('union','president','activities','pr','rights','design','docs','general'));
    alter table public.content add column if not exists show_on_home boolean not null default true;
    if add_department or add_home then
        update public.content set
            department = case when not add_department then department
                when kind = 'document' then 'docs'
                when category in ('校園活動','活動公告') then 'activities'
                when category = '學生權益' then 'rights'
                else 'union' end,
            show_on_home = case when add_home then kind = 'announcement' else show_on_home end;
    end if;
end;
$$;

-- 001 originally used the automatically named content_check for URL-only documents.
alter table public.content drop constraint if exists content_check;
alter table public.content drop constraint if exists content_document_source_check;
alter table public.content add constraint content_document_source_check
    check (kind <> 'document' or url is not null or length(btrim(body)) > 0);

create index if not exists content_department_listing on public.content (department, status, date desc);
grant insert (department, show_on_home), update (department, show_on_home) on public.content to authenticated;

commit;
