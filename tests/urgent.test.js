import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { urgentDeadline, taipeiInput, activeUrgent } from '../lib/urgent.js';
import { validateContent } from '../lib/content.js';

test('urgent deadlines use Taiwan time and only unexpired published announcements are active',()=>{
    assert.equal(urgentDeadline('2099-10-24T18:30'),'2099-10-24T10:30:00.000Z');
    assert.equal(taipeiInput('2099-10-24T10:30:00Z'),'2099-10-24T18:30');
    for (const invalid of ['2026-02-30T18:30','2026-02-30T18:30:00Z','2026-10-24T25:00','infinity','not-a-date']) assert.equal(urgentDeadline(invalid),null);
    const row={kind:'announcement',status:'published',is_urgent:true,urgent_until:'2099-10-24T10:30:00Z'};
    const now=Date.parse('2099-10-24T10:29:59Z');
    assert.equal(activeUrgent(row,now),true);
    for (const change of [{kind:'document'},{status:'draft'},{status:'archived'},{is_urgent:false},{urgent_until:'invalid'},{urgent_until:new Date(now).toISOString()}]) assert.equal(activeUrgent({...row,...change},now),false);
});

test('validation requires urgent expiration, prevents accidental expired publication, and clears disabled flags',()=>{
    const input={kind:'announcement',title:'活動異動',category:'緊急通告',date:'2026-10-24',status:'published',is_urgent:true,urgent_until:'2099-10-24T18:30'};
    assert.equal(validateContent(input).urgent_until,'2099-10-24T10:30:00.000Z');
    for (const change of [{urgent_until:''},{urgent_until:'2020-10-24T18:30'},{is_urgent:'true'},{kind:'document',body:'內容'}]) assert.throws(()=>validateContent({...input,...change}));
    assert.equal(validateContent({...input,status:'archived',urgent_until:'2020-10-24T18:30'}).is_urgent,true);
    assert.equal(validateContent({...input,is_urgent:false}).urgent_until,null);
});

test('urgent migration preserves existing content and permissions and can be applied twice',async t=>{
    const db=new PGlite();t.after(()=>db.close());
    await db.exec("create role anon; create role authenticated; create table content(id integer primary key,kind text,title text); insert into content values(1,'announcement','保留原文'); grant select on content to anon,authenticated;");
    // The index uses status, as on existing managed content tables.
    await db.exec("alter table content add column status text default 'published'");
    const sql=await readFile(new URL('../supabase/migrations/003_urgent_notices.sql',import.meta.url),'utf8');
    await db.exec(sql);
    assert.deepEqual((await db.query('select title,is_urgent,urgent_until from content')).rows,[{title:'保留原文',is_urgent:false,urgent_until:null}]);
    await db.exec("update content set is_urgent=true,urgent_until='2099-10-24T10:30:00Z'");
    await db.exec(sql);
    assert.equal((await db.query('select is_urgent from content')).rows[0].is_urgent,true);
    const grants=(await db.query("select has_column_privilege('authenticated','content','is_urgent','UPDATE') as staff,has_column_privilege('anon','content','is_urgent','UPDATE') as public")).rows[0];
    assert.equal(grants.staff,true);assert.equal(grants.public,false);
});
