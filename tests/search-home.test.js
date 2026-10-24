import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostnameRoot, rootRepositoryName, searchHomeHtml } from '../lib/search-home.js';
import { publicRoot } from '../lib/seo.js';

test('root bundle provides hostname-level identity and stable official assets without changing app URLs',async()=>{
    const out=await mkdtemp(join(tmpdir(),'tlsh-search-home-test-'));
    try {
        execFileSync(process.execPath,['scripts/prepare-search-home.mjs',out],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
        const html=await readFile(join(out,'index.html'),'utf8');
        const data=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
        const site=data['@graph'].find(item=>item['@type']==='WebSite');
        assert.equal(site.url,hostnameRoot);assert.equal(site.name,'斗六高中學生會');
        assert.equal(rootRepositoryName,'tlshstudent-max.github.io');
        assert.ok(html.includes(`<link rel="canonical" href="${hostnameRoot}">`));
        assert.ok(html.includes(`href="${hostnameRoot}favicon.png"`));
        assert.ok(html.includes(`class="enter" href="${publicRoot}"`));
        assert.ok(!html.includes('http-equiv="refresh"'));assert.ok(!html.includes('<script src='));
        const project=await readFile(new URL('../index.html',import.meta.url),'utf8');
        assert.equal(html.match(/<meta name="description" content="([^"]+)"/)[1],project.match(/<meta name="description" content="([^"]+)"/)[1]);
        assert.equal((html.match(/name="google-site-verification"/g)||[]).length,(project.match(/name="google-site-verification"/g)||[]).length);
        for(const [source,target]of[['favicon.png','favicon.png'],['apple-touch-icon.png','apple-touch-icon.png'],['og-image.png','og-image.png'],['assets/union-logo.jpg','union-logo.jpg']])assert.deepEqual(await readFile(join(out,target)),await readFile(new URL('../'+source,import.meta.url)));
        const robots=await readFile(join(out,'robots.txt'),'utf8');assert.ok(robots.includes('Allow: /'));assert.ok(robots.includes(hostnameRoot+'sitemap.xml'));
        const sitemap=await readFile(join(out,'sitemap.xml'),'utf8'),locations=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>match[1]);
        assert.ok(locations.includes(hostnameRoot));assert.ok(locations.includes(publicRoot));assert.equal(new Set(locations).size,locations.length);assert.ok(!locations.some(url=>url.includes('/admin/')));
        await writeFile(join(out,'keep.txt'),'existing content');
        assert.throws(()=>execFileSync(process.execPath,['scripts/prepare-search-home.mjs',out],{cwd:new URL('../',import.meta.url),stdio:'pipe'}));
        assert.equal(await readFile(join(out,'keep.txt'),'utf8'),'existing content');
        assert.ok((await readdir(out)).includes('.nojekyll'));
    } finally {await rm(out,{recursive:true,force:true});}
});

test('homepage metadata and visible description keep literal text without script injection',()=>{
    const html=searchHomeHtml('公告 </script><script>alert(1)</script> & 學生權益',['public-token" onload="bad']);
    assert.ok(html.includes('公告 &lt;/script&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));
    const data=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data['@graph'].find(item=>item['@type']==='WebPage').description,'公告 </script><script>alert(1)</script> & 學生權益');
    assert.ok(html.includes('public-token&quot; onload=&quot;bad'));
});
