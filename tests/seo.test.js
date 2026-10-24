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
        assert.match(html,/<link rel="icon" href="(?:\.\.\/)?favicon\.png" type="image\/png" sizes="96x96">/,file);
        assert.match(html,/<link rel="apple-touch-icon" href="(?:\.\.\/)?apple-touch-icon\.png" sizes="180x180">/,file);
    }
    const sitemap=await readFile(new URL('../sitemap.xml',import.meta.url),'utf8');
    assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]).sort(),pages.map(path=>publicRoot+path).sort());
    const admin=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');assert.match(admin,/noindex, nofollow/);
    const home=await readFile(new URL('../index.html',import.meta.url),'utf8');
    assert.match(home,/<section[^>]*id="departments"[^>]*data-nosnippet/);
    assert.match(home,/<p class="hero-description">國立斗六高中學生會官方網站/);
    const png=await readFile(new URL('../og-image.png',import.meta.url));assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
});

test('official identity uses the uploaded badge, correctly sized icons and verified social account',async()=>{
    const home=await readFile(new URL('../index.html',import.meta.url),'utf8');
    const data=JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const organization=data['@graph'].find(item=>item['@type']==='Organization');
    assert.equal(organization.logo.url,publicRoot+'assets/union-logo.jpg');
    assert.deepEqual(organization.sameAs,['https://www.instagram.com/tlsh_su/']);
    await access(new URL('../assets/union-logo.jpg',import.meta.url));
    assert.match(home,/<img class="hero-logo" src="assets\/union-logo\.jpg" alt="斗六高中學生會正式會標"/);
    assert.ok(!home.includes('identity-plate'));
    const manifest=JSON.parse(await readFile(new URL('../site.webmanifest',import.meta.url),'utf8'));
    assert.deepEqual(manifest.icons.map(item=>item.sizes),['192x192','512x512']);
    for(const [file,size] of [['favicon.png',96],['apple-touch-icon.png',180],...manifest.icons.map(item=>[item.src,Number(item.sizes.split('x')[0])])]) {
        const png=await readFile(new URL('../'+file,import.meta.url));
        assert.equal(png.readUInt32BE(16),size,file);assert.equal(png.readUInt32BE(20),size,file);
    }
});

test('article metadata uses published identity and bounded plain descriptions',()=>{
    const item={id:'12345678-1234-4234-8234-123456789abc',title:'會議紀錄',summary:'',body:'第一行\n第二行 '+ '字'.repeat(200)};
    const meta=articleMetadata(item,'document');
    assert.equal(meta.description.length,160);assert.ok(!meta.description.includes('\n'));
    assert.equal(meta.url,publicRoot+'announcement.html?id='+item.id+'&kind=document');
    assert.equal(articleMetadata({...item,body:''},'announcement').description,'閱讀斗六高中學生會的公告：會議紀錄');
});
