import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { searchHomeHtml, hostnameRoot } from '../../lib/search-home.js';
import { publicRoot } from '../../lib/seo.js';

test.use({javaScriptEnabled:false});
test('root brand homepage works without JavaScript and retains readable mobile navigation',async({page},testInfo)=>{
    const source=await readFile(new URL('../../index.html',import.meta.url),'utf8');
    const description=source.match(/<meta name="description" content="([^"]+)"/)[1];
    const files={'/favicon.png':'favicon.png','/union-logo.jpg':'assets/union-logo.jpg','/apple-touch-icon.png':'apple-touch-icon.png','/og-image.png':'og-image.png'};
    await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==new URL(hostnameRoot).origin)return route.abort();
        if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:searchHomeHtml(description)});
        if(files[url.pathname])return route.fulfill({contentType:url.pathname.endsWith('.jpg')?'image/jpeg':'image/png',body:await readFile(new URL('../../'+files[url.pathname],import.meta.url))});
        return route.abort();
    });
    for(const width of [1440,390,320]){
        await page.setViewportSize({width,height:900});await page.goto(hostnameRoot);
        await expect(page.getByRole('heading',{level:1})).toContainText('學生會');
        await expect(page.getByRole('link',{name:'進入學生會官網',exact:true})).toHaveAttribute('href',publicRoot);
        expect(await page.locator('.identity img').evaluate(img=>img.complete&&img.naturalWidth===939)).toBe(true);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        for(const link of await page.locator('a').all())expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
        if(width!==320)await page.screenshot({path:testInfo.outputPath(`search-home-${width}.png`)});
        if(width===320)expect(await page.evaluate(()=>{document.documentElement.style.fontSize='200%';return document.documentElement.scrollWidth<=innerWidth;})).toBe(true);
    }
    expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe(hostnameRoot);
    expect(await page.locator('link[rel=icon]').getAttribute('href')).toBe(hostnameRoot+'favicon.png');
});
