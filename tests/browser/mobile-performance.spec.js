import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.route('**/site-config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const siteConfig={supabaseUrl:'',supabasePublishableKey:''};" }));
});

for (const theme of ['dark', 'light']) test(`touch scrolling uses lightweight materials across the site in ${theme} appearance`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('tlsh-appearance', value), theme);
    for (const path of ['/', '/president/', '/docs/', '/activities/', '/pr/', '/rights/', '/design/', '/general/', '/privacy.html', '/announcement.html', '/admin/']) {
        await page.goto(path); await page.locator('.sitebar').waitFor();
        const styles = await page.locator('.sitebar, .feedback-card, .archive-controls, .login-card').evaluateAll(nodes => nodes.map(node => {
            const style = getComputedStyle(node);
            return { blur: style.backdropFilter, safariBlur: style.webkitBackdropFilter || 'none' };
        }));
        for (const style of styles) { expect(style.blur, path).toBe('none'); expect(style.safariBlur, path).toBe('none'); }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    }
});

test('a hidden mobile exhibit downloads no graphics modules or GPU context', async ({ page }) => {
    const requested = []; page.on('request', request => requested.push(new URL(request.url()).pathname));
    await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext; window.testWebGLContexts = 0;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (type === 'webgl' || type === 'webgl2') window.testWebGLContexts++;
            return original.call(this, type, ...args);
        };
    });
    await page.goto('/'); await page.locator('.sitebar').waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('#glass-orb')).toBeHidden();
    expect(requested).not.toContain('/lib/orb-renderer.js');
    expect(requested).not.toContain('/lib/orb-lettering.js');
    expect(requested).not.toContain('/stone-texture.svg');
    expect(requested).toContain('/assets/stone-texture-mobile.webp');
    expect(await page.evaluate(() => window.testWebGLContexts)).toBe(0);
    const texture = await page.evaluate(async () => {
        const image = new Image(); image.src = 'assets/stone-texture-mobile.webp'; await image.decode();
        return [image.naturalWidth, image.naturalHeight];
    });
    expect(texture).toEqual([512, 512]);
});

test('native touch gestures scroll the page and theme changes do not animate the entire document', async ({ page }) => {
    await page.goto('/'); await page.locator('.sitebar').waitFor();
    await page.getByRole('button', { name: '切換為白色版' }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme-changing');
    await expect(page.locator('body')).toHaveCSS('transition-duration', '0s');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 650 }] });
    for (let y = 620; y >= 150; y -= 30) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
        await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
    const nav = await page.locator('.sitebar').boundingBox(); expect(Math.abs(nav.y)).toBeLessThan(1);
    await expect(page.locator('.sitebar')).toHaveCSS('backdrop-filter', 'none');
});

test('desktop still uses the original stone and glass material', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: false, isMobile: false });
    try {
        const page = await context.newPage();
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await page.route('**/site-config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const siteConfig={supabaseUrl:'',supabasePublishableKey:''};" }));
        await page.goto('/docs/'); await page.locator('.sitebar').waitFor();
        await expect(page.locator('.sitebar')).toHaveCSS('backdrop-filter', 'blur(24px) saturate(1.4)');
        expect(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundImage)).toContain('/stone-texture.svg');
    } finally { await context.close(); }
});
