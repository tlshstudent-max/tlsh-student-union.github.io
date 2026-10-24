import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftStore } from '../lib/drafts.js';

function memory() {
    const data = new Map();
    return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const values = { kind:'announcement',title:'尚未送出的文字',summary:'',body:'第一行\n第二行',category:'學生會公告',date:'2026-10-24',academic_year:'',url:'',status:'draft',department:'union',show_on_home:true,is_urgent:false,urgent_until:'' };

test('local drafts isolate accounts, projects, and content, and exclude credentials', () => {
    const storage = memory();
    const mine = createDraftStore(storage, 'project-a', 'ADMIN@example.com');
    assert.equal(mine.save('first', { ...values, access_token:'must-not-be-copied' }, 3), true);
    assert.deepEqual(createDraftStore(storage, 'project-a', 'admin@example.com').load('first').values, values);
    assert.equal(mine.load('first').version, 3);
    assert.equal(mine.load('second'), null);
    assert.equal(createDraftStore(storage, 'project-a', 'other@example.com').load('first'), null);
    assert.equal(createDraftStore(storage, 'project-b', 'admin@example.com').load('first'), null);
    assert.equal([...storage.data.values()][0].includes('must-not-be-copied'), false);
    mine.remove('first');
    assert.equal(mine.load('first'), null);
});

test('unfinished editor values can be recovered; malformed or oversized drafts fail safely', () => {
    const storage = memory(), store = createDraftStore(storage, 'project', 'admin@example.com');
    assert.equal(store.save(null, { ...values, title:'',date:'' }), true);
    assert.equal(store.load(null).values.title, '');
    assert.equal(store.save('large', { ...values,body:'a'.repeat(20001) }), false);
    assert.equal(store.save('bad-version', values, -1), false);
    const key = [...storage.data.keys()][0];
    storage.data.set(key, '{invalid');
    assert.equal(store.load(null), null);
    storage.data.set(key, JSON.stringify({values:{...values,unrecognized:'ignore'},version:null,savedAt:Date.now()}));
    assert.equal(store.load(null).values.unrecognized, undefined);
    const legacy={...values,category:'校園活動'};
    delete legacy.department; delete legacy.show_on_home;
    storage.data.set(key,JSON.stringify({values:legacy,version:null,savedAt:Date.now()}));
    assert.equal(store.load(null).values.department,'activities');
    assert.equal(store.load(null).values.show_on_home,true);
    delete legacy.is_urgent; delete legacy.urgent_until;
    storage.data.set(key,JSON.stringify({values:legacy,version:null,savedAt:Date.now()}));
    assert.equal(store.load(null).values.is_urgent,false);
    assert.equal(store.load(null).values.urgent_until,'');
    assert.equal(store.save('urgent',{...values,is_urgent:true,urgent_until:'2099-10-24T18:00'}),true);
    assert.equal(store.load('urgent').values.is_urgent,true);
    assert.equal(store.load('urgent').values.urgent_until,'2099-10-24T18:00');
});

test('unavailable browser storage does not crash the editor', () => {
    const unavailable = new Proxy({}, {get:()=>()=>{throw new Error('storage unavailable');}});
    const store = createDraftStore(unavailable, 'project', 'admin@example.com');
    assert.equal(store.load(null), null);
    assert.equal(store.save(null, values), false);
    assert.equal(store.remove(null), false);
});
