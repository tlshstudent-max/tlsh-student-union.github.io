import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, normalizeDate, safeHttpsUrl, validateContent, mayEdit, mayPublish } from '../lib/content.js';

test('CSV handles quoted commas, escaped quotes, multiline fields and CRLF', () => {
    assert.deepEqual(parseCsv('\ufeffdate,title\r\n2026-10-01,"Hello, ""校園""\n下一行"\r\n\r\n'), [
        ['\ufeffdate', 'title'], ['2026-10-01', 'Hello, "校園"\n下一行'],
    ]);
    assert.throws(() => parseCsv('one,"unfinished'));
});

test('only real calendar dates and safe HTTPS links are accepted', () => {
    assert.equal(normalizeDate('2024-02-29').iso, '2024-02-29');
    assert.equal(normalizeDate('2/28/2026').iso, '2026-02-28');
    for (const date of ['2026-02-29', '2026-13-01', '2026-01-00', 'bad']) assert.equal(normalizeDate(date), null);
    for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', '/relative']) assert.equal(safeHttpsUrl(url), null);
    assert.equal(safeHttpsUrl('https://example.com/校園'), 'https://example.com/%E6%A0%A1%E5%9C%92');
});

test('content validation enforces document sources and preserves plain text', () => {
    const input = { kind: 'announcement', title: '<img src=x onerror=alert(1)>', summary: '', body: '第一行\n第二行', date: '2026-10-23', category: '公告', status: 'draft' };
    assert.equal(validateContent(input).body, input.body);
    assert.equal(validateContent(input).title, input.title);
    for (const change of [{kind:'document',body:''}, {status:'private'}, {title:' '}, {date:'2026-02-30'}, {url:'javascript:alert(1)'}, {title:'字'.repeat(161)}, {department:'unknown'}, {show_on_home:'false'}]) {
        assert.throws(() => validateContent({...input, ...change}));
    }
    assert.equal(validateContent({...input, kind:'document', url:'https://example.com/file'}).url, 'https://example.com/file');
    assert.equal(validateContent({...input,kind:'document'}).body,input.body);
    assert.equal(validateContent({...input,department:'pr',show_on_home:false}).department,'pr');
});

test('UI permissions distinguish editing from publishing and disabled accounts', () => {
    const editor = { active:true, role:'editor', edit_announcements:true, edit_documents:false, can_publish:false };
    assert.equal(mayEdit(editor, 'announcement'), true);
    assert.equal(mayEdit(editor, 'document'), false);
    assert.equal(mayPublish(editor), false);
    assert.equal(mayEdit({...editor, active:false, role:'admin'}, 'announcement'), false);
    assert.equal(mayPublish({...editor, role:'admin'}), true);
});
