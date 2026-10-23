import { sheetToSql } from './sheet-import.js';

function unwrapTransaction(sql) {
    if (!/^begin;\s*$/m.test(sql) || !/^commit;\s*$/m.test(sql)) {
        throw new Error('初始化來源缺少預期的交易範圍，未產生設定檔。');
    }
    return sql.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '').trim();
}

export function prepareBackend({ email, csv, migration }) {
    const ownerEmail = String(email || '').trim().toLowerCase();
    if (ownerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
        throw new Error('請填入已確認、實際用來 Google 登入的完整管理員信箱。');
    }
    const imported = sheetToSql(csv);
    if (imported.warnings.length) {
        throw new Error(`公開資料含有錯誤，未產生設定檔：\n${imported.warnings.join('\n')}`);
    }
    if (!imported.count) {
        throw new Error('沒有讀到可搬移的公開內容。請確認下載的是網站使用的公開 CSV。');
    }
    const ownerLiteral = `'${ownerEmail.replaceAll("'", "''")}'`;
    return {
        count: imported.count,
        sql: `-- First-time backend setup. Contains a personal administrator email; keep private.
-- Apply only to the intended NEW Supabase project. All changes are atomic.
begin;
do $setup_guard$
begin
    if to_regclass('public.staff_members') is not null
       or to_regclass('public.content') is not null
       or to_regclass('public.audit_log') is not null then
        raise exception 'Backend already initialized. First-time setup cannot replace existing accounts or content. See SETUP.md.';
    end if;
end;
$setup_guard$;

${unwrapTransaction(migration)}

-- First administrator, explicitly authorized by the project owner.
insert into public.staff_members
    (email, role, edit_announcements, edit_documents, can_publish, active)
values (${ownerLiteral}, 'admin', true, true, true, true);

${unwrapTransaction(imported.sql)}

commit;
`,
    };
}
