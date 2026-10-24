// Rasterize the original official badge and a static share layout; never redraw the badge.
// Run separately from the JS bundle build; this command needs an installed Chromium browser.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('assets/union-logo.jpg', root));
const badge = `data:image/jpeg;base64,${source.toString('base64')}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const render = async (html, width, height, target, transparent = false) => {
        await page.setViewportSize({ width, height });
        await page.setContent(html);
        await page.evaluate(async () => {
            await Promise.all([...document.images].map(img => img.decode()));
            await document.fonts.ready;
        });
        await writeFile(new URL(target, root), await page.screenshot({ omitBackground: transparent }));
    };
    for (const [size, path, round] of [
        [96, 'favicon.png', true], [180, 'apple-touch-icon.png', false],
        [192, 'assets/union-logo-192.png', true], [512, 'assets/union-logo-512.png', true],
    ]) {
        await render(`<style>html,body{margin:0;background:${round ? 'transparent' : '#fff'};}img{display:block;width:100vw;height:100vh;${round ? 'border-radius:50%;' : ''}}</style><img src="${badge}" alt="">`, size, size, path, round);
    }
    await render(`<!doctype html><html lang="zh-TW"><meta charset="UTF-8"><style>
        *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f8f7ef;color:#141e40;font-family:'Noto Sans CJK TC','Noto Sans TC',system-ui,sans-serif;display:flex;align-items:center;gap:64px;padding:72px 80px}
        img{width:350px;height:350px;border-radius:50%;flex-shrink:0}
        main{min-width:0;flex:1}.eyebrow{font-size:20px;letter-spacing:3px;color:#796018;margin:0 0 22px}h1{font-size:48px;font-weight:600;line-height:1.4;letter-spacing:1px;margin:0 0 28px}.intro{font-size:25px;line-height:1.8;margin:0;color:#4c5260}.rule{height:2px;width:64px;background:#bca45b;margin:28px 0}.address{font-size:19px;color:#606571;letter-spacing:1px;margin:0}
        </style><img src="${badge}" alt=""><main><p class="eyebrow">TLSH STUDENT UNION</p><h1>國立斗六高中<br>學生會官方網站</h1><p class="intro">最新公告・校園活動・學生權益<br>會議紀錄與公開文件</p><div class="rule"></div><p class="address">公開資訊，免登入就能閱讀。</p></main></html>`, 1200, 630, 'og-image.png');
} finally {
    await browser.close();
}
console.log('Generated official badge icons and 1200 × 630 share image.');
