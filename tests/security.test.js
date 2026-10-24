import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL policies enforce public, editor and administrator boundaries', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create function auth.jwt() returns jsonb language sql stable as $$
            select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
        $$;
        create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
        grant usage on schema auth to anon, authenticated;
        grant execute on all functions in schema auth to anon, authenticated;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/001_content_management.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/002_publication_locations.sql', import.meta.url), 'utf8'));
    await db.exec(`
        insert into staff_members (email, role, edit_announcements, edit_documents, can_publish) values
          ('admin@example.com','admin',true,true,true),
          ('editor@example.com','editor',true,false,false),
          ('publisher@example.com','editor',true,false,true);
        insert into content(kind,title,category,date,status) values
          ('announcement','Public notice','公告','2026-10-23','published'),
          ('announcement','Private draft','公告','2026-10-23','draft');
        insert into content(kind,title,category,date,status,url) values
          ('document','Private document','法規','2026-10-23','draft','https://example.com/file');
    `);
    async function as(email) {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(email ? { email, sub:'00000000-0000-4000-8000-000000000001' } : {})]);
        await db.exec(email ? 'set role authenticated' : 'set role anon');
    }
    const insert = (kind, status='draft', url=null) => db.query('insert into content(kind,title,category,date,status,url) values ($1,$2,$3,$4,$5,$6) returning id', [kind,'New content','公告','2026-10-23',status,url]);
    const manage = (email, role, active=true) => db.query('select manage_staff($1,$2,true,true,true,$3)', [email,role,active]);

    await t.test('anonymous and nonstaff accounts read only published content', async () => {
        for (const email of [null, 'outsider@example.com']) {
            await as(email);
            assert.deepEqual((await db.query('select title from content')).rows.map(x=>x.title), ['Public notice']);
            await assert.rejects(insert('announcement'), /permission|row-level/i);
            if (!email) await assert.rejects(db.exec("update content set title='tampered'"), /permission|row-level/i);
            else assert.equal((await db.query("update content set title='tampered' returning id")).rows.length, 0);
            if (!email) await assert.rejects(db.exec('select * from staff_members'), /permission/i);
            else assert.equal((await db.query('select * from staff_members')).rows.length, 0);
            await assert.rejects(manage('outsider@example.com','admin'), /permission|administrator/i);
        }
    });
    await t.test('editor can edit announcement drafts but cannot publish, modify published rows, access document drafts, or grant permissions', async () => {
        await as('editor@example.com');
        const rows = (await db.query('select title from content')).rows.map(x=>x.title);
        assert(rows.includes('Private draft')); assert(!rows.includes('Private document'));
        await insert('announcement');
        await assert.rejects(insert('announcement','published'), /row-level/i);
        await assert.rejects(insert('document','draft','https://example.com/file'), /row-level/i);
        await assert.rejects(db.exec("update content set status='published' where title='Private draft'"), /row-level/i);
        assert.equal((await db.query("update content set title='tampered' where title='Public notice' returning id")).rows.length, 0);
        await assert.rejects(db.exec("update staff_members set role='admin' where email='editor@example.com'"), /permission/i);
        await assert.rejects(manage('editor@example.com','admin'), /administrator/i);
        await assert.rejects(db.exec('delete from content'), /permission/i);
        assert.equal((await db.query('select * from audit_log')).rows.length, 0);
    });
    await t.test('publisher can publish permitted content and stale version updates do not overwrite changes', async () => {
        await as('publisher@example.com');
        const {rows:[item]} = await insert('announcement');
        assert.equal((await db.query('update content set status=$1 where id=$2 and version=1 returning version',['published',item.id])).rows[0].version,2);
        assert.equal((await db.query("update content set title='stale edit' where id=$1 and version=1 returning id",[item.id])).rows.length,0);
        await assert.rejects(insert('document','published','https://example.com/file'), /row-level/i);
    });
    await t.test('database rejects unsafe URLs, missing document sources and invalid statuses', async () => {
        await as('admin@example.com');
        for (const url of [null,'http://example.com','javascript:alert(1)','https://user:pass@example.com']) {
            await assert.rejects(insert('document','draft',url), /check constraint/i);
        }
        await assert.rejects(insert('announcement','invalid'), /check constraint/i);
        await assert.rejects(db.exec("update content set version=99"), /permission/i);
    });
    await t.test('locations and inline minutes follow the existing edit and publish permissions',async()=>{
        await as('admin@example.com');
        const {rows:[row]}=await db.query("insert into content(kind,title,category,date,body,department,show_on_home,status) values ('document','會議紀錄','會議紀錄','2026-10-24','完整紀錄','docs',true,'published') returning id");
        await as(null);
        assert.equal((await db.query("select title from content where id=$1 and show_on_home=true",[row.id])).rows[0].title,'會議紀錄');
        await assert.rejects(db.query("update content set department='pr' where id=$1",[row.id]),/permission/i);
        await as('editor@example.com');
        assert.equal((await db.query("update content set department='rights' where id=$1 returning id",[row.id])).rows.length,0);
        await db.query("insert into content(kind,title,category,date,department,show_on_home) values ('announcement','公關草稿','公關消息','2026-10-24','pr',false)");
        await as(null);
        assert.equal((await db.query("select title from content where department='pr'")).rows.length,0);
    });
    await t.test('admin can authorize staff, database auditing records actor, and last admin remains protected', async () => {
        await as('admin@example.com');
        await assert.rejects(manage('admin@example.com','editor'), /last active administrator/i);
        await assert.rejects(manage('admin@example.com','admin',false), /last active administrator/i);
        await manage('second@example.com','admin');
        await manage('editor@example.com','editor',false);
        const audit=(await db.query("select * from audit_log where actor_email='admin@example.com'")).rows;
        assert(audit.some(x=>x.entity==='staff_members' && x.after_data.email==='second@example.com'));
        await assert.rejects(db.exec('delete from audit_log'), /permission/i);
        await manage('admin@example.com','editor');
        await assert.rejects(manage('admin@example.com','admin'), /administrator/i);
        await as('second@example.com');
        await assert.rejects(manage('second@example.com','editor'), /last active administrator/i);
    });
    await t.test('disabling a member revokes edits even while their JWT is still valid', async () => {
        await as('editor@example.com');
        assert(!(await db.query('select title from content')).rows.some(x=>x.title==='Private draft'));
        await assert.rejects(insert('announcement'), /row-level/i);
        assert.equal((await db.query("update content set title='disabled edit' returning id")).rows.length,0);
    });
});
