import {test,expect} from '@playwright/test';

test.use({viewport:{width:1440,height:1000},launchOptions:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--enable-unsafe-swiftshader']}});
test.beforeEach(async({page})=>{
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.route('**/site-config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const siteConfig={supabaseUrl:'',supabasePublishableKey:''};"}));
});

test('glass badge renders in both themes and supports drag, interruption, keyboard and reset',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');
    const orb=page.locator('#glass-orb'),canvas=orb.locator('canvas');
    await expect(orb).toHaveClass(/orb-ready/);
    await expect(orb).toHaveAttribute('tabindex','0');
    await expect(page.locator('#orb-help')).toContainText('拖曳轉動');
    const baseline=await canvas.screenshot();
    const box=await orb.boundingBox();
    await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.73,box.y+box.height*.65,{steps:10});
    await expect(orb).toHaveClass(/orb-dragging/);
    const dragged=await canvas.screenshot();expect(dragged.equals(baseline)).toBe(false);
    await page.mouse.up();await expect(orb).not.toHaveClass(/orb-dragging/);
    // A second grab can interrupt the moving sphere immediately.
    await page.mouse.down();await page.mouse.move(box.x+box.width*.48,box.y+box.height*.52,{steps:4});
    await expect(orb).toHaveClass(/orb-dragging/);await page.mouse.up();
    await page.getByRole('button',{name:'回正',exact:true}).click();
    await expect(page.locator('#orb-status')).toHaveText('會標已回正。');
    await orb.focus();await page.keyboard.press('ArrowRight');
    await expect(page.locator('#orb-status')).toContainText('已轉動');
    await page.keyboard.press('Home');await expect(page.locator('#orb-status')).toHaveText('會標已回正。');
    await page.screenshot({path:testInfo.outputPath('orb-dark.png')});
    await page.getByRole('button',{name:'切換為白色版'}).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme-changing');
    await page.screenshot({path:testInfo.outputPath('orb-light.png')});
    await expect(orb).toHaveClass(/orb-ready/);expect(errors).toEqual([]);
});

test('reduced motion has no inertia and cancellation releases the drag',async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
    const orb=page.locator('#glass-orb'),canvas=orb.locator('canvas');await expect(orb).toHaveClass(/orb-ready/);
    const box=await orb.boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55,{steps:6});await page.mouse.up();
    const still=await canvas.screenshot();await page.waitForTimeout(180);
    expect((await canvas.screenshot()).equals(still)).toBe(true);
    await page.getByRole('button',{name:'回正',exact:true}).click();await expect(page.locator('#orb-status')).toHaveText('會標已回正。');
    await orb.evaluate(e=>e.addEventListener('pointerdown',event=>e.dataset.testPointer=event.pointerId,{once:true}));
    await page.mouse.move(box.x+100,box.y+100);await page.mouse.down();
    await orb.dispatchEvent('pointercancel',{pointerId:Number(await orb.getAttribute('data-test-pointer'))});await page.mouse.up();
    await expect(orb).not.toHaveClass(/orb-dragging/);
});

test('unsupported graphics retain the real badge without dead controls',async({page})=>{
    await page.addInitScript(()=>{
        const get=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:get.call(this,type,...args);};
    });
    await page.goto('/');await expect(page.locator('.hero-logo')).toBeVisible();
    await expect(page.locator('#orb-reset')).toBeHidden();await expect(page.locator('.orb-canvas')).toBeHidden();
    await expect(page.locator('#glass-orb')).not.toHaveAttribute('tabindex');
});

test('context loss falls back to the real badge and restoration resumes the controls',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');const orb=page.locator('#glass-orb');await expect(orb).toHaveClass(/orb-ready/);
    await orb.locator('canvas').evaluate(canvas=>{canvas.testExtension=canvas.getContext('webgl').getExtension('WEBGL_lose_context');canvas.testExtension.loseContext();});
    await expect(orb).not.toHaveClass(/orb-ready/);await expect(page.locator('#orb-reset')).toBeHidden();
    await expect(page.locator('.hero-logo')).toHaveCSS('opacity','1');
    await orb.locator('canvas').evaluate(canvas=>canvas.testExtension.restoreContext());
    await expect(orb).toHaveClass(/orb-ready/);await orb.focus();await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#orb-status')).toContainText('已轉動');expect(errors).toEqual([]);
});

test('the sphere sleeps while idle and after it leaves the viewport',async({page})=>{
    await page.addInitScript(()=>{
        const draw=WebGLRenderingContext.prototype.drawArrays;window.testOrbDraws=0;
        WebGLRenderingContext.prototype.drawArrays=function(...args){window.testOrbDraws++;return draw.apply(this,args);};
    });
    await page.goto('/');await expect(page.locator('#glass-orb')).toHaveClass(/orb-ready/);
    await expect.poll(()=>page.evaluate(()=>window.testOrbDraws)).toBeGreaterThan(0);
    await page.waitForTimeout(100);const idle=await page.evaluate(()=>window.testOrbDraws);await page.waitForTimeout(160);
    expect(await page.evaluate(()=>window.testOrbDraws)).toBe(idle);
    await page.locator('#glass-orb').focus();await page.keyboard.press('ArrowRight');
    await expect.poll(()=>page.evaluate(()=>window.testOrbDraws)).toBeGreaterThan(idle);
    await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(100);
    const sleeping=await page.evaluate(()=>window.testOrbDraws);await page.waitForTimeout(160);
    expect(await page.evaluate(()=>window.testOrbDraws)).toBe(sleeping);
});

test('letters have open backgrounds and visible solid depth at an exact side view',async({page},testInfo)=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(()=>{
        const draw=WebGLRenderingContext.prototype.drawArrays;
        WebGLRenderingContext.prototype.drawArrays=function(...args){
            draw.apply(this,args);
            const width=this.drawingBufferWidth,height=this.drawingBufferHeight,bytes=new Uint8Array(width*height*4);
            this.readPixels(0,0,width,height,this.RGBA,this.UNSIGNED_BYTE,bytes);
            let count=0,min=width,max=0;
            for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(bytes[(y*width+x)*4+3]>245){count++;min=Math.min(min,x);max=Math.max(max,x);}
            window.testSolidLetterPixels={count,min,max,width,height};
        };
    });
    await page.goto('/');const orb=page.locator('#glass-orb');await expect(orb).toHaveClass(/orb-ready/);
    await expect.poll(()=>page.evaluate(()=>window.testSolidLetterPixels?.count||0)).toBeGreaterThan(1000);
    const front=await page.evaluate(()=>window.testSolidLetterPixels);
    await page.screenshot({path:testInfo.outputPath('solid-front.png')});
    expect(front.count/(front.width*front.height)).toBeLessThan(.35);
    const box=await orb.boundingBox(),x=box.x+box.width*.45,y=box.y+box.height*.5;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+Math.PI/2/.009,y,{steps:8});await page.mouse.up();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const side=await page.evaluate(()=>window.testSolidLetterPixels);
    expect(side.count).toBeGreaterThan(1000);
    expect((side.max-side.min)/side.width).toBeGreaterThan(.07);
    await page.screenshot({path:testInfo.outputPath('solid-side.png')});
});
