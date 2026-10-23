import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { prepareBackend } from '../lib/backend-setup.js';

const run = promisify(execFile);
const migration = await readFile(new URL('../supabase/migrations/001_content_management.sql', import.meta.url), 'utf8');
const csv = 'date,year,category,title,description,url,status,news_date,news_category,news_title,news_summary,news_url\n,,,,,,,2026-10-23,學生會公告,原有公告,保留原有內容,https://example.com/news';

test('first-time setup grants the exact confirmed email full management rights and preserves imported content', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        create role anon; create role authenticated; create schema auth;
        create function auth.jwt() returns jsonb language sql stable as $$
            select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
        $$;
        create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
        grant usage on schema auth to anon, authenticated;
        grant execute on all functions in schema auth to anon, authenticated;
    `);
    const setup = prepareBackend({ email:'  HARVEY@example.com  ', csv, migration });
    await db.exec(setup.sql);
    assert.equal(setup.count, 1);
    assert.deepEqual((await db.query('select email, role, active, edit_announcements, edit_documents, can_publish from staff_members')).rows, [{
        email:'harvey@example.com', role:'admin', active:true, edit_announcements:true, edit_documents:true, can_publish:true,
    }]);
    assert.equal((await db.query('select title from content')).rows[0].title, '原有公告');
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({email:'harvey@example.com',sub:'00000000-0000-4000-8000-000000000001'})]);
    await db.exec('set role authenticated');
    await db.exec("select manage_staff('editor@example.com','editor',true,false,false,true)");
    assert.equal((await db.query("select role from staff_members where email='editor@example.com'")).rows[0].role, 'editor');
    await db.exec('reset role');
    await assert.rejects(db.exec(prepareBackend({email:'another@example.com',csv,migration}).sql), /already initialized/i);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as count from staff_members')).rows[0].count, 2);
    assert.equal((await db.query('select title from content')).rows[0].title, '原有公告');
    assert.equal((await db.query("select count(*)::int as count from staff_members where email='another@example.com'")).rows[0].count, 0);
});

test('setup rejects display names, malformed or empty public data, and missing transaction wrappers', () => {
    assert.throws(() => prepareBackend({email:'HARVEY',csv,migration}), /完整管理員信箱/);
    assert.throws(() => prepareBackend({email:'harvey@example.com',csv:'',migration}), /沒有讀到/);
    assert.throws(() => prepareBackend({email:'harvey@example.com',csv:csv.replace('2026-10-23','2026-02-30'),migration}), /公開資料含有錯誤/);
    assert.throws(() => prepareBackend({email:'harvey@example.com',csv,migration:'create table unsafe();'}), /交易範圍/);
});

test('CLI keeps personal setup outside the checkout, restricts file permissions, and never overwrites files', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'tlsh-setup-test-'));
    t.after(() => rm(dir,{recursive:true,force:true}));
    const source = join(dir,'public.csv'), output = join(dir,'setup.sql');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(source,csv);
    const script = new URL('../scripts/prepare-backend.js',import.meta.url);
    const args = [script.pathname,'--owner','harvey@example.com','--csv',source,'--output',output];
    await run(process.execPath,args);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    const saved = await readFile(output,'utf8');
    await assert.rejects(run(process.execPath,args), error => error.stderr.includes('輸出檔已存在'));
    assert.equal(await readFile(output,'utf8'),saved);
    const inside = new URL('../setup-must-not-exist.sql',import.meta.url).pathname;
    await assert.rejects(run(process.execPath,[...args.slice(0,-1),inside]), error => error.stderr.includes('儲存庫外'));
    await symlink(new URL('../',import.meta.url).pathname,join(dir,'repo-link'));
    await assert.rejects(run(process.execPath,[...args.slice(0,-1),join(dir,'repo-link','setup-must-not-exist.sql')]), error => error.stderr.includes('儲存庫外'));
});
