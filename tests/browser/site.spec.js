import { test, expect } from '@playwright/test';

const csv = 'date,year,category,title,description,url,status,news_date,news_category,news_title,news_summary,news_url\n2026-10-01,115,會議紀錄,公開會議紀錄,文件說明,https://example.com/file,公開,2026-10-01,學生會公告,校園測試消息,公告摘要,https://example.com/news';
const id = '12345678-1234-4234-8234-123456789abc';
const article = { id, kind:'announcement', title:'第一則公告', summary:'公告摘要', body:'第一行\n第二行', category:'學生會公告', date:'2026-10-23', academic_year:'', url:null, status:'draft', version:1 };
const admin = { email:'admin@example.com', role:'admin', active:true, edit_announcements:true, edit_documents:true, can_publish:true };

test.beforeEach(async ({page}) => {
    await page.route('https://docs.google.com/**', route => route.fulfill({ contentType:'text/csv', body:csv, headers:{'Access-Control-Allow-Origin':'*'} }));
    await page.route('https://fonts.googleapis.com/**', route=>route.abort());
    await page.route('https://fonts.gstatic.com/**', route=>route.abort());
});

async function backend(page, member=admin, options={}) {
    let contents = [{...article}];
    let members = member ? [member] : [];
    const calls = [];
    await page.route('**/site-config.js', route => route.fulfill({ contentType:'text/javascript', body:"export const siteConfig = {supabaseUrl:'https://school.supabase.co',supabasePublishableKey:'sb_publishable_browser_test'};" }));
    if (options.session !== false) await page.addInitScript(({email}) => {
        if(sessionStorage.getItem('test-session-seeded')) return;
        sessionStorage.setItem('test-session-seeded','true');
        const now=Math.floor(Date.now()/1000);
        const user={ id:'00000000-0000-4000-8000-000000000001', email, aud:'authenticated', role:'authenticated', app_metadata:{provider:'google'}, user_metadata:{}, created_at:new Date().toISOString() };
        const token = btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:user.id,email,exp:now+3600,iat:now,aud:'authenticated',role:'authenticated'}))+'.test-signature';
        localStorage.setItem('sb-school-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user}));
    }, {email:member?.email || 'outsider@example.com'});
    await page.route('https://school.supabase.co/**', async route => {
        const request=route.request(), url=new URL(request.url());
        const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'};
        const reply = (data,status=200) => route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});
        if(request.method()==='OPTIONS') return route.fulfill({status:204,headers});
        calls.push({path:url.pathname,method:request.method(),body:request.postDataJSON()});
        if(url.pathname==='/rest/v1/staff_members') {
            const email=url.searchParams.get('email')?.slice(3);
            return reply(email ? members.filter(x=>x.email===email) : members);
        }
        if(url.pathname==='/rest/v1/content') {
            if(request.method()==='POST') { const data={...request.postDataJSON(),id,version:1}; contents.push(data); return reply([{id}]); }
            if(request.method()==='PATCH') {
                if(options.conflict) return reply([]);
                contents=contents.map(item=>({...item,...request.postDataJSON(),version:item.version+1})); return reply([{id}]);
            }
            let data=contents;
            if(url.searchParams.get('status')==='eq.published') data=data.filter(x=>x.status==='published');
            if(url.searchParams.get('kind')?.startsWith('eq.')) data=data.filter(x=>x.kind===url.searchParams.get('kind').slice(3));
            if(url.searchParams.get('id')) data=data.filter(x=>x.id===url.searchParams.get('id').slice(3));
            return reply(data);
        }
        if(url.pathname==='/rest/v1/rpc/manage_staff') {
            const v=request.postDataJSON();
            members.push({email:v.member_email,role:v.member_role,active:v.member_active,edit_announcements:v.allow_announcements,edit_documents:v.allow_documents,can_publish:v.allow_publish});
            return reply(null);
        }
        if(url.pathname==='/rest/v1/audit_log') return reply([]);
        if(url.pathname==='/auth/v1/logout') return reply({});
        return reply({message:'not mocked'},400);
    });
    return {calls, setContents:items=>{contents=items;}};
}

test('public pages work without login; news precedes departments and documents filter correctly',async({page})=>{
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.news-card h3')).toHaveText('校園測試消息');
    expect(await page.locator('#announcements').evaluate(node=>Boolean(node.compareDocumentPosition(document.getElementById('departments')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await page.getByRole('link',{name:'公開文件',exact:true}).first().click();
    await expect(page.locator('.archive-item')).toHaveCount(1);
    await page.locator('#document-search').fill('不存在');
    await expect(page.locator('.archive-item')).toHaveCount(0);
    await page.locator('#document-search').fill('會議');
    await expect(page.locator('.archive-item')).toHaveCount(1);
    for(const path of ['/activities/','/pr/','/rights/','/design/','/general/','/president/','/privacy.html']) {
        await page.goto(path); await expect(page.locator('h1')).toBeVisible();
    }
    expect(errors).toEqual([]);
});

test('mobile navigation and key pages fit narrow viewports',async({page})=>{
    for(const width of [320,390,768]) {
        await page.setViewportSize({width,height:844});
        for(const path of ['/','/docs/','/admin/']) {
            await page.goto(path);
            expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
    }
});

test('unconfigured admin is honest and cannot simulate a login',async({page})=>{
    await page.goto('/admin/');
    await expect(page.locator('#login-status')).toContainText('後台尚未啟用');
    await expect(page.locator('#google-login')).toBeDisabled();
    await expect(page.locator('#dashboard')).toBeHidden();
});

for(const member of [null,{...admin,active:false}]) test(`${member ? 'disabled' : 'nonstaff'} accounts cannot enter the workspace`,async({page})=>{
    await backend(page, member);
    await page.goto('/admin/');
    await expect(page.locator('#login-status')).toContainText('尚未獲授權');
    await expect(page.locator('#dashboard')).toBeHidden();
    await expect(page.locator('#login-signout')).toBeVisible();
});

test('signout clears the session and stays signed out after reload',async({page})=>{
    await backend(page);
    await page.goto('/admin/');
    await expect(page.locator('#dashboard')).toBeVisible();
    await page.getByRole('button',{name:'登出',exact:true}).click();
    await expect(page.locator('#login-status')).toContainText('安全登出');
    await page.reload();
    await expect(page.locator('#dashboard')).toBeHidden();
    await expect(page.locator('#google-login')).toBeEnabled();
});

test('Google login uses PKCE and returns to admin under the repository base path',async({page})=>{
    await backend(page,null,{session:false});
    // Serve this checkout under a project path, as GitHub Pages does.
    await page.route('**/project/**', async route => {
        const local=new URL(route.request().url());
        if (local.pathname.endsWith('/site-config.js')) return route.fulfill({contentType:'text/javascript',body:"export const siteConfig = {supabaseUrl:'https://school.supabase.co',supabasePublishableKey:'sb_publishable_browser_test'};"});
        const response=await route.fetch({url:local.origin+local.pathname.replace('/project','')+local.search});
        await route.fulfill({response});
    });
    const authRequest=page.waitForRequest(request=>request.url().includes('/auth/v1/authorize'));
    await page.goto('/project/admin/');
    await page.locator('#google-login').click();
    const url=new URL((await authRequest).url());
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:8010/project/admin/');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
});

test('admin can save a draft, preview text safely, publish, archive, and authorize a member',async({page})=>{
    const mock=await backend(page);
    await page.goto('/admin/');
    await expect(page.locator('#dashboard')).toBeVisible();
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.getByLabel('標題',{exact:true}).fill('<img src=x onerror=alert(1)> 校園公告');
    await page.getByLabel('公告內文（選填）').fill('第一行\n第二行');
    await page.getByText('預覽公開內容',{exact:true}).click();
    await expect(page.locator('#preview-title')).toHaveText('<img src=x onerror=alert(1)> 校園公告');
    await expect(page.locator('#preview-title img')).toHaveCount(0);
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
    expect(mock.calls.some(x=>x.method==='POST' && x.body?.status==='draft')).toBe(true);
    await page.getByRole('button',{name:'編輯',exact:true}).first().click();
    await page.getByLabel('內容狀態').selectOption('published');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已發布');
    await page.getByRole('button',{name:'編輯',exact:true}).first().click();
    await page.getByLabel('內容狀態').selectOption('archived');
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已下架');
    await page.getByRole('button',{name:'成員與權限',exact:true}).click();
    await page.getByLabel('Google 帳號電子郵件').fill('new@example.com');
    await page.getByLabel('編輯公告',{exact:true}).check();
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'儲存授權'}).click();
    await expect(page.locator('#member-status')).toContainText('授權已儲存');
    const call=mock.calls.find(x=>x.path.endsWith('/manage_staff'));
    expect(call.body).toMatchObject({member_email:'new@example.com',member_role:'editor',allow_announcements:true,allow_publish:false});
});

test('editor sees only permitted management controls and cannot select published status',async({page})=>{
    await backend(page,{...admin,email:'editor@example.com',role:'editor',edit_documents:false,can_publish:false});
    await page.goto('/admin/');
    await expect(page.locator('#dashboard')).toBeVisible();
    await expect(page.getByRole('button',{name:'成員與權限',exact:true})).toBeHidden();
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await expect(page.locator('[name=kind] option[value=document]')).toHaveJSProperty('disabled', true);
    await expect(page.locator('[name=status] option[value=published]')).toHaveJSProperty('disabled', true);
});

test('version conflict preserves the unsaved editor text',async({page})=>{
    await backend(page,admin,{conflict:true});
    await page.goto('/admin/');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await page.getByLabel('標題',{exact:true}).fill('這份文字不能遺失');
    await page.locator('#save-content').click();
    await expect(page.locator('#editor-status')).toContainText('已被其他人修改');
    await expect(page.getByLabel('標題',{exact:true})).toHaveValue('這份文字不能遺失');
    await expect(page.locator('#content-dialog')).toBeVisible();
});

test('configured public pages read only published backend content, including safe full articles',async({page})=>{
    const mock=await backend(page,admin,{session:false});
    mock.setContents([{...article,status:'published',title:'正式公告',body:'<script>alert(1)</script>\n完整內容'}]);
    await page.goto('/');
    await expect(page.locator('.news-card h3')).toHaveText('正式公告');
    await page.locator('.news-card').click();
    await expect(page.locator('#article-title')).toHaveText('正式公告');
    await expect(page.locator('#article-body')).toHaveText('<script>alert(1)</script>\n完整內容');
    await expect(page.locator('#article-body script')).toHaveCount(0);
    mock.setContents([]);
    await page.reload();
    await expect(page.locator('#article-status')).toContainText('未公開');
});

test('offline data gets an honest fallback and document retry recovers',async({page})=>{
    await page.route('https://docs.google.com/**',route=>route.abort());
    await page.goto('/');
    await expect(page.locator('#announcement-status')).toContainText('網站預設公告');
    await page.goto('/docs/');
    await expect(page.locator('#archive-status')).toContainText('暫時無法讀取');
    await page.route('https://docs.google.com/**',route=>route.fulfill({contentType:'text/csv',body:csv,headers:{'Access-Control-Allow-Origin':'*'}}));
    await page.getByRole('button',{name:'重新載入'}).click();
    await expect(page.locator('.archive-item')).toHaveCount(1);
});
