import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { publication, contentHref } from '../lib/publication.js';

test('explicit publication locations override categories and old records retain compatible defaults', () => {
    assert.deepEqual(publication({kind:'announcement',category:'校園活動'}),{department:'activities',show_on_home:true});
    assert.deepEqual(publication({kind:'document'}),{department:'docs',show_on_home:false});
    assert.deepEqual(publication({kind:'announcement',category:'校園活動',department:'pr',show_on_home:false}),{department:'pr',show_on_home:false});
    assert.equal(contentHref({id:'example',kind:'document',body:'會議紀錄',url:null}),'announcement.html?id=example&kind=document');
    assert.equal(contentHref({id:'example',kind:'document',body:'',url:'https://example.com/minutes'}),'https://example.com/minutes');
});

test('existing projects gain locations and inline documents without losing content or overwriting later choices', async t => {
    const db = new PGlite(); t.after(()=>db.close());
    await db.exec(`
        create role anon; create role authenticated;
        create table public.content (
            id uuid primary key default gen_random_uuid(), kind text not null, title text not null,
            summary text not null default '',body text not null default '',category text not null,
            date date not null,academic_year text not null default '',url text,
            status text not null default 'draft',version integer not null default 1,
            check (kind <> 'document' or url is not null)
        );
        grant select on content to anon,authenticated;
        grant insert(kind,title,summary,body,category,date,academic_year,url,status),update(title,status) on content to authenticated;
        insert into content(kind,title,body,category,date,status,url) values
          ('announcement','原活動','保留內文','校園活動','2026-10-01','published',null),
          ('announcement','原學權公告','原資料','學生權益','2026-10-02','draft',null),
          ('document','原會議紀錄','','會議紀錄','2026-10-03','published','https://example.com/minutes');
    `);
    const sql = await readFile(new URL('../supabase/migrations/002_publication_locations.sql',import.meta.url),'utf8');
    await db.exec(sql);
    const rows=(await db.query('select * from content order by date')).rows;
    assert.equal(rows.length,3);
    assert.equal(rows[0].department,'activities'); assert.equal(rows[0].body,'保留內文');
    assert.equal(rows[1].department,'rights'); assert.equal(rows[1].status,'draft');
    assert.equal(rows[2].department,'docs'); assert.equal(rows[2].show_on_home,false);
    await db.query("update content set department='pr',show_on_home=false where title='原活動'");
    await db.exec(sql);
    const existing=(await db.query("select * from content where title='原活動'")).rows[0];
    assert.equal(existing.department,'pr'); assert.equal(existing.show_on_home,false);
    await db.exec("insert into content(kind,title,body,category,date,department) values ('document','直接輸入的紀錄','完整會議紀錄','會議紀錄','2026-10-24','docs')");
    await assert.rejects(db.exec("insert into content(kind,title,category,date) values ('document','沒有來源','會議紀錄','2026-10-24')"),/check constraint/i);
    await assert.rejects(db.exec("update content set department='unknown'"),/check constraint/i);
    const grants=(await db.query("select has_column_privilege('authenticated','content','department','UPDATE') as staff,has_column_privilege('anon','content','department','UPDATE') as public")).rows[0];
    assert.equal(grants.staff,true); assert.equal(grants.public,false);
});
