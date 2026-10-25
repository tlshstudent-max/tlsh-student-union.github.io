// Offline conversion of the existing texture, not a new background design.
// CHROMIUM_PATH=/usr/bin/chromium node scripts/rasterize-stone.mjs
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../stone-texture.svg', import.meta.url);
const svg = `data:image/svg+xml;base64,${(await readFile(source)).toString('base64')}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
    const page = await browser.newPage();
    const encoded = await page.evaluate(async url => {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
        canvas.getContext('2d').drawImage(image, 0, 0, 512, 512);
        return canvas.toDataURL('image/webp', .9).split(',')[1];
    }, svg);
    await writeFile(new URL('../assets/stone-texture-mobile.webp', import.meta.url), Buffer.from(encoded, 'base64'));
} finally { await browser.close(); }
