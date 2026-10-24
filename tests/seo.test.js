import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { articleMetadata, publicRoot } from '../lib/seo.js';

const pages=['','activities/','president/','pr/','rights/','design/','docs/','general/','privacy.html'];
test('public source pages expose unique canonical metadata and existing share assets without JavaScript',async()=>{
    const titles=new Set(), descriptions=new Set();
    for(const path of pages) {
        const file=path.endsWith('.html')?path:path+'index.html';
        const html=await readFile(new URL('../'+file,import.meta.url),'utf8');
        const title=html.match(/<title>(.*?)<\/title>/)[1];
        const description=html.match(/<meta name="description" content="([^"]+)"/)[1];
        assert.ok(!titles.has(title),file);assert.ok(!descriptions.has(description),file);titles.add(title);descriptions.add(description);
        assert.ok(html.includes(`<link rel="canonical" href="${publicRoot+path}">`),file);
        for(const property of ['og:site_name','og:title','og:description','og:url','og:image','og:image:alt']) assert.match(html,new RegExp(`<meta property="${property}" content="[^\"]+"`),file);
        const image=html.match(/<meta property="og:image" content="([^"]+)"/)[1];
        assert.ok(image.startsWith(publicRoot));await access(new URL('../'+image.slice(publicRoot.length),import.meta.url));
        assert.ok(html.indexOf('theme.js')<html.indexOf('rel="stylesheet"'),file);
        assert.ok(html.includes('theme.css'),file);
    }
    const sitemap=await readFile(new URL('../sitemap.xml',import.meta.url),'utf8');
    assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]).sort(),pages.map(path=>publicRoot+path).sort());
    const admin=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');assert.match(admin,/noindex, nofollow/);
    const png=await readFile(new URL('../og-image.png',import.meta.url));assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
});

test('article metadata uses published identity and bounded plain descriptions',()=>{
    const item={id:'12345678-1234-4234-8234-123456789abc',title:'會議紀錄',summary:'',body:'第一行\n第二行 '+ '字'.repeat(200)};
    const meta=articleMetadata(item,'document');
    assert.equal(meta.description.length,160);assert.ok(!meta.description.includes('\n'));
    assert.equal(meta.url,publicRoot+'announcement.html?id='+item.id+'&kind=document');
    assert.equal(articleMetadata({...item,body:''},'announcement').description,'閱讀斗六高中學生會的公告：會議紀錄');
});
