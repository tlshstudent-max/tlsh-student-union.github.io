import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { sheetToSql } from '../lib/sheet-import.js';

test('sheet export preserves content, escapes SQL and can be imported repeatedly without duplicates',async t=>{
    const db=new PGlite(); t.after(()=>db.close());
    await db.exec('create table content (id uuid primary key,kind text,title text,summary text,body text,category text,date text,academic_year text,url text,status text)');
    const csv = 'date,year,category,title,description,url,status,news_date,news_category,news_title,news_summary,news_url\n2026-10-01,115,法規,文件,說明,https://example.com/file,公開,2026-10-01,公告,"Student\'s news; DROP TABLE content;",摘要,https://example.com/news';
    const result=sheetToSql(csv);
    assert.equal(result.count,2); assert.deepEqual(result.warnings,[]);
    await db.exec(result.sql); await db.exec(result.sql);
    const rows=(await db.query('select * from content')).rows;
    assert.equal(rows.length,2);
    assert(rows.some(row=>row.title==="Student's news; DROP TABLE content;"));
    assert(rows.every(row=>row.status==='published'));
    assert.equal(sheetToSql(csv).sql,result.sql);
});

test('invalid legacy data is reported instead of silently discarded',()=>{
    const result=sheetToSql('a,b,c,d,e,f,g,h,i,j,k,l\n2026-02-30,115,法規,文件,摘要,http://unsafe,,bad,公告,消息,摘要,');
    assert.equal(result.count,0); assert.equal(result.warnings.length,2);
});
