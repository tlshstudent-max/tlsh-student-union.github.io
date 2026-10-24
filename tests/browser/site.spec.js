import { test, expect } from '@playwright/test';
import { siteConfig } from '../../site-config.js';
import { departments, publication } from '../../lib/publication.js';

const csv = 'date,year,category,title,description,url,status,news_date,news_category,news_title,news_summary,news_url\n2026-10-01,115,會議紀錄,公開會議紀錄,文件說明,https://example.com/file,公開,2026-10-01,學生會公告,校園測試消息,公告摘要,https://example.com/news';
const id = '12345678-1234-4234-8234-123456789abc';
const article = { id, kind:'announcement', title:'第一則公告', summary:'公告摘要', body:'第一行\n第二行', category:'學生會公告', date:'2026-10-23', academic_year:'', url:null, status:'draft', version:1 };
const admin = { email:'admin@example.com', role:'admin', active:true, edit_announcements:true, edit_documents:true, can_publish:true };

function contrastRatio(first,second) {
    const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
    const a=luminance(first),b=luminance(second);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test.beforeEach(async ({page}) => {
    // Keep legacy/unconfigured scenarios independent of the production rollout setting.
    await page.route('**/site-config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const siteConfig = {supabaseUrl:'',supabasePublishableKey:''};"}));
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
        calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:request.method(),body:request.postDataJSON()});
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
            if(url.searchParams.get('department')) data=data.filter(x=>publication(x).department===url.searchParams.get('department').slice(3));
            if(url.searchParams.get('show_on_home')==='eq.true') data=data.filter(x=>publication(x).show_on_home);
            if(url.searchParams.get('is_urgent')==='eq.true') data=data.filter(x=>x.is_urgent===true);
            if(url.searchParams.get('urgent_until')?.startsWith('gt.')) data=data.filter(x=>Date.parse(x.urgent_until)>Date.parse(url.searchParams.get('urgent_until').slice(3)));
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
    await page.route('**/site-config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const siteConfig = {supabaseUrl:'',supabasePublishableKey:''};"}));
    await page.goto('/admin/');
    await expect(page.locator('#login-status')).toContainText('後台尚未啟用');
    await expect(page.locator('#google-login')).toBeDisabled();
    await expect(page.locator('#dashboard')).toBeHidden();
});

test('staged backend configuration preserves the public Sheets feed while allowing staff login setup',async({page})=>{
    const mock=await backend(page,null,{session:false});
    await page.route('**/site-config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const siteConfig = {supabaseUrl:'https://school.supabase.co',supabasePublishableKey:'sb_publishable_browser_test',publicDataSource:'sheets'};"}));
    await page.goto('/');
    await expect(page.locator('.news-card h3')).toHaveText('校園測試消息');
    await page.goto('/docs/');
    await expect(page.locator('.archive-item')).toHaveCount(1);
    expect(mock.calls.some(call=>call.path==='/rest/v1/content')).toBe(false);
    await page.goto('/admin/');
    await expect(page.locator('#google-login')).toBeEnabled();
});

for(const member of [null,{...admin,active:false}]) test(`${member ? 'disabled' : 'nonstaff'} accounts cannot enter the workspace`,async({page})=>{
    await backend(page, member);
    await page.goto('/admin/');
    await expect(page.locator('#login-status')).toContainText('尚未獲授權');
    await expect(page.locator('#dashboard')).toBeHidden();
    await expect(page.locator('#login-signout')).toBeVisible();
    await expect(page.locator('#login-identity')).toContainText(member?.email || 'outsider@example.com');
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

test('Google callback exchanges the code and opens the authorized workspace',async({page})=>{
    const mock=await backend(page,admin,{session:false});
    await page.goto('/admin/');
    await page.evaluate(()=>localStorage.setItem('sb-school-auth-token-code-verifier',JSON.stringify('test-pkce-verifier')));
    const now=Math.floor(Date.now()/1000);
    const user={id:'00000000-0000-4000-8000-000000000001',email:admin.email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'google'},user_metadata:{},created_at:new Date().toISOString()};
    const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,email:user.email,exp:now+3600,iat:now,aud:'authenticated',role:'authenticated'})).toString('base64url')+'.test-signature';
    let exchange;
    await page.route('https://school.supabase.co/auth/v1/token?grant_type=pkce',async route=>{
        exchange=route.request().postDataJSON();
        await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user})});
    });
    await page.goto('/admin/?code=test-callback-code');
    await expect(page.locator('#dashboard')).toBeVisible();
    expect(exchange).toMatchObject({auth_code:'test-callback-code',code_verifier:'test-pkce-verifier'});
    expect(mock.calls.some(call=>call.path==='/rest/v1/staff_members')).toBe(true);
    await expect(page).toHaveURL(/\/admin\/$/);
    await page.reload();
    await expect(page.locator('#dashboard')).toBeVisible();
});

test('provider callback errors are explained without exposing returned details',async({page})=>{
    await backend(page,null,{session:false});
    await page.goto('/admin/?keep=value#error=access_denied&error_description=private-provider-details');
    await expect(page.locator('#login-status')).toContainText('Google 尚未完成授權');
    await expect(page.locator('#google-login')).toBeEnabled();
    await expect(page.locator('#login-signout')).toBeHidden();
    await expect(page.locator('body')).not.toContainText('private-provider-details');
    await expect(page).toHaveURL(/\/admin\/\?keep=value$/);
    const retry=page.waitForRequest(request=>request.url().includes('/auth/v1/authorize'));
    await page.locator('#google-login').click();
    expect(new URL((await retry).url()).searchParams.get('redirect_to')).toBe('http://127.0.0.1:8010/admin/');
});

test('expired callback codes show a retry instead of a successful signed-out state',async({page})=>{
    await backend(page,null,{session:false});
    await page.goto('/admin/');
    await page.evaluate(()=>localStorage.setItem('sb-school-auth-token-code-verifier',JSON.stringify('test-pkce-verifier')));
    await page.route('https://school.supabase.co/auth/v1/token?grant_type=pkce',route=>route.fulfill({status:400,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'X-Supabase-Api-Version','X-Supabase-Api-Version':'2024-01-01'},body:JSON.stringify({code:'flow_state_expired',msg:'private-exchange-details'})}));
    await page.goto('/admin/?code=expired-callback-code');
    await expect(page.locator('#login-status')).toContainText('登入驗證已失效');
    await expect(page.locator('#google-login')).toBeEnabled();
    await expect(page.locator('#dashboard')).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/$/);
});

test('callback without a saved verifier explains how to restart in the same browser',async({page})=>{
    await backend(page,null,{session:false});
    let exchanges=0;
    await page.route('https://school.supabase.co/auth/v1/token?grant_type=pkce',route=>{exchanges++;return route.abort();});
    await page.goto('/admin/?code=callback-in-another-browser');
    await expect(page.locator('#login-status')).toContainText('同一個瀏覽器');
    await expect(page.locator('#google-login')).toBeEnabled();
    await expect(page.locator('#dashboard')).toBeHidden();
    expect(exchanges).toBe(0);
    await expect(page).toHaveURL(/\/admin\/$/);
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
    await expect(page.locator('#view-published')).toHaveAttribute('href',`../announcement.html?id=${id}`);
    await page.getByRole('button',{name:'編輯',exact:true}).first().click();
    await page.getByLabel('內容狀態').selectOption('archived');
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已下架');
    await expect(page.locator('#view-published')).toBeHidden();
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
    await expect(page.getByRole('button',{name:'新增會議紀錄',exact:true})).toBeDisabled();
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

test('production configuration serves workspace announcements and documents to signed-out visitors',async({page})=>{
    await page.unroute('**/site-config.js');
    const requests=[],sheetRequests=[];
    let unavailable=false;
    const published=[
        {...article,status:'published',title:'後台發布的正式消息'},
        {...article,id:'12345678-1234-4234-8234-123456789abd',kind:'document',status:'published',title:'後台發布的會議紀錄',academic_year:'115',url:'https://example.com/meeting'},
    ];
    await page.route('https://docs.google.com/**',route=>{sheetRequests.push(route.request().url());return route.abort();});
    await page.route(`${siteConfig.supabaseUrl}/**`,route=>{
        const request=route.request(),url=new URL(request.url());
        requests.push(url);
        if(unavailable) return route.fulfill({status:503,contentType:'application/json',body:'{"message":"temporarily unavailable"}'});
        const data=url.pathname==='/rest/v1/content' && url.searchParams.get('status')==='eq.published'
            ? published.filter(item=>(!url.searchParams.get('kind')||`eq.${item.kind}`===url.searchParams.get('kind'))
                && (!url.searchParams.get('department')||`eq.${publication(item).department}`===url.searchParams.get('department'))
                && (url.searchParams.get('show_on_home')!=='eq.true'||publication(item).show_on_home)) : [];
        return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
    });
    await page.goto('/');
    await expect(page.locator('.news-card h3')).toHaveText('後台發布的正式消息');
    await page.goto('/docs/');
    await expect(page.locator('.archive-item')).toHaveCount(1);
    await expect(page.locator('.archive-item')).toContainText('後台發布的會議紀錄');
    unavailable=true;
    await page.reload();
    // Allow the SDK's transient-error retries and the public reader's 12-second timeout.
    await expect(page.locator('#archive-status')).toContainText('暫時無法讀取',{timeout:15000});
    await expect(page.locator('.archive-item')).toHaveCount(0);
    expect(sheetRequests).toEqual([]);
    expect(requests.length).toBeGreaterThanOrEqual(3);
    expect(requests.every(url=>url.pathname==='/rest/v1/content' && url.searchParams.get('status')==='eq.published')).toBe(true);
});

test('offline public feeds show no stale announcements and retry recovers',async({page})=>{
    let online=false;
    await page.route('https://docs.google.com/**',route=>online ? route.fulfill({contentType:'text/csv',body:csv,headers:{'Access-Control-Allow-Origin':'*'}}) : route.abort());
    await page.goto('/');
    await expect(page.locator('#announcement-status')).toContainText('暫時無法讀取');
    await expect(page.locator('.news-card')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('斗中學生會官網正式上線');
    online=true;
    await page.locator('#announcement-status').getByRole('button',{name:'重新載入'}).click();
    await expect(page.locator('.news-card h3')).toHaveText('校園測試消息');
    online=false;
    await page.goto('/docs/');
    await expect(page.locator('#archive-status')).toContainText('暫時無法讀取');
    online=true;
    await page.locator('#archive-status').getByRole('button',{name:'重新載入'}).click();
    await expect(page.locator('.archive-item')).toHaveCount(1);
});

test('mobile visitors see the first announcement within the first screen',async({page})=>{
    const mock=await backend(page,admin,{session:false});
    mock.setContents([{...article,status:'published'}]);
    for(const width of [320,390]) {
        await page.setViewportSize({width,height:844});
        await page.goto('/');
        await expect(page.locator('.news-card h3')).toBeVisible();
        const bounds=await page.locator('.news-card h3').boundingBox();
        expect(bounds.y+bounds.height).toBeLessThan(844);
    }
});

test('document library distinguishes no published documents from filtered results',async({page})=>{
    const mock=await backend(page,admin,{session:false});
    await page.goto('/docs/');
    await expect(page.locator('#archive-status')).toContainText('目前尚無公開文件');
    await expect(page.locator('#archive-controls')).toBeHidden();
    mock.setContents([{...article,kind:'document',status:'published',url:'https://example.com/file',academic_year:'115',category:'會議紀錄'}]);
    await page.reload();
    await expect(page.locator('.archive-item')).toHaveCount(1);
    await expect(page.locator('#document-filters')).not.toHaveAttribute('open');
    await page.locator('#document-filters summary').click();
    await page.locator('#category-filter').selectOption('會議紀錄');
    await expect(page.locator('#active-filter-count')).toContainText('1');
    await page.locator('#document-filters summary').click();
    await expect(page.locator('#active-filter-count')).toBeVisible();
    await page.locator('#document-search').fill('不存在');
    await expect(page.locator('#archive-status')).toContainText('沒有符合條件');
    await page.locator('#archive-status').getByRole('button',{name:'清除搜尋與篩選'}).click();
    await expect(page.locator('.archive-item')).toHaveCount(1);
    await expect(page.locator('#document-search')).toHaveValue('');
    await expect(page.locator('#category-filter')).toHaveValue('');
});

test('local editor drafts survive reload, preserve custom categories, and clear after saving',async({page})=>{
    const mock=await backend(page);
    page.on('dialog',dialog=>dialog.accept());
    await page.goto('/admin/');
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.getByLabel('標題',{exact:true}).fill('暫存的活動想法');
    await page.getByRole('radio',{name:'公關組',exact:true}).check();
    await page.getByLabel('同時顯示在首頁最新消息',{exact:true}).uncheck();
    await page.getByLabel('類別',{exact:true}).selectOption('__custom__');
    await page.getByLabel('自訂類別',{exact:true}).fill('跨組合作');
    await page.getByLabel('公告內文（選填）').fill('尚未儲存的文字');
    await expect(page.locator('#draft-status')).toContainText('已暫存');
    expect(mock.calls.some(call=>call.method==='POST')).toBe(false);
    await page.reload();
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await expect(page.locator('#draft-recovery')).toBeVisible();
    await expect(page.getByLabel('標題',{exact:true})).toHaveValue('');
    await page.getByRole('button',{name:'回復暫存',exact:true}).click();
    await expect(page.getByLabel('標題',{exact:true})).toHaveValue('暫存的活動想法');
    await expect(page.getByLabel('自訂類別',{exact:true})).toHaveValue('跨組合作');
    await expect(page.getByRole('radio',{name:'公關組',exact:true})).toBeChecked();
    await expect(page.getByLabel('同時顯示在首頁最新消息',{exact:true})).not.toBeChecked();
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
    expect(mock.calls.find(call=>call.method==='POST').body.category).toBe('跨組合作');
    expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('tlsh-draft:')))).toEqual([]);
});

test('recovering an old local draft keeps the base version and cannot overwrite newer content',async({page})=>{
    const mock=await backend(page,admin,{conflict:true});
    page.on('dialog',dialog=>dialog.accept());
    await page.goto('/admin/');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await page.getByLabel('標題',{exact:true}).fill('先前尚未儲存的版本');
    mock.setContents([{...article,version:2,title:'其他幹部已更新'}]);
    await page.reload();
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await expect(page.locator('#draft-recovery-message')).toContainText('後台已有較新版本');
    await page.getByRole('button',{name:'回復暫存',exact:true}).click();
    await page.locator('#save-content').click();
    await expect(page.locator('#editor-status')).toContainText('已被其他人修改');
    expect(mock.calls.find(call=>call.method==='PATCH').query.version).toBe('eq.1');
    await expect(page.getByLabel('標題',{exact:true})).toHaveValue('先前尚未儲存的版本');
});

test('staff can use the activity template and published activities appear on the activity page',async({page})=>{
    const mock=await backend(page);
    mock.setContents([]);
    await page.goto('/admin/');
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.getByRole('button',{name:'套用活動範本'}).click();
    await expect(page.getByLabel('類別',{exact:true})).toHaveValue('校園活動');
    await expect(page.getByLabel('公告內文（選填）')).toHaveValue(/活動時間：/);
    await page.getByLabel('標題',{exact:true}).fill('測試用活動');
    await page.getByLabel('公告內文（選填）').fill('活動時間：測試日期\n活動地點：測試場地\n報名方式：測試方式');
    await page.getByLabel('內容狀態').selectOption('published');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#save-content').click();
    await expect(page.locator('#view-published')).toHaveAttribute('href',`../announcement.html?id=${id}`);
    await page.goto('/activities/');
    await expect(page.locator('#activity-list h3')).toHaveText('測試用活動');
    await page.locator('#activity-list .news-card').click();
    await expect(page.locator('#article-body')).toContainText('活動地點：測試場地');
    mock.setContents([]);
    await page.goto('/activities/');
    await expect(page.locator('#activity-status')).toContainText('近期活動待公告');
    await expect(page.locator('#activity-list .news-card')).toHaveCount(0);
});

test('feedback accepts anonymous messages and optional email; failed sends preserve input',async({page})=>{
    const submitted=[];
    let online=true;
    await page.route('https://formspree.io/**',route=>{
        submitted.push(route.request().postData());
        return route.fulfill({status:online?200:503,contentType:'application/json',body:JSON.stringify({ok:online})});
    });
    await page.goto('/president/#feedback');
    await page.getByLabel('你的意見',{exact:true}).fill('   ');
    await page.getByRole('button',{name:'送出意見',exact:true}).click();
    expect(submitted).toHaveLength(0);
    await page.getByLabel('你的意見',{exact:true}).fill('匿名同學的建議');
    await page.getByRole('button',{name:'送出意見',exact:true}).click();
    await expect(page.locator('#fs-status')).toContainText('訊息已送達');
    expect(submitted).toHaveLength(1);
    await page.getByLabel('聯絡信箱（選填，供本案回覆）').fill('invalid-email');
    await page.getByLabel('你的意見',{exact:true}).fill('希望收到回覆的建議');
    await page.getByRole('button',{name:'送出意見',exact:true}).click();
    expect(submitted).toHaveLength(1);
    await page.getByLabel('聯絡信箱（選填，供本案回覆）').fill('reply@example.com');
    online=false;
    await page.getByRole('button',{name:'送出意見',exact:true}).click();
    await expect(page.locator('#fs-status')).toContainText('目前無法送出');
    await expect(page.getByLabel('你的意見',{exact:true})).toHaveValue('希望收到回覆的建議');
    await expect(page.getByLabel('聯絡信箱（選填，供本案回覆）')).toHaveValue('reply@example.com');
    expect(submitted[1]).toContain('reply@example.com');
});

test('a browser storage failure warns the editor while backend draft saving still works',async({page})=>{
    await backend(page);
    await page.addInitScript(()=>{
        const original=Storage.prototype.setItem;
        Storage.prototype.setItem=function(key,value) {
            if(key.startsWith('tlsh-draft:')) throw new DOMException('storage full','QuotaExceededError');
            return original.call(this,key,value);
        };
    });
    await page.goto('/admin/');
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.getByLabel('標題',{exact:true}).fill('直接儲存到後台');
    await expect(page.locator('#draft-status')).toContainText('目前無法暫存');
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
});

test('an in-flight save cannot reopen the workspace after the account signs out',async({page})=>{
    await backend(page);
    let finishSave;
    await page.route('https://school.supabase.co/rest/v1/content*',route=>{
        if(route.request().method()!=='POST') return route.fallback();
        return new Promise(resolve=>{finishSave=async()=>{
            await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify([{id}])});
            resolve();
        };});
    });
    await page.goto('/admin/');
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.getByLabel('標題',{exact:true}).fill('儲存中的草稿');
    await page.locator('#save-content').click();
    await expect(page.locator('#editor-status')).toHaveText('正在儲存…');
    await expect(page.getByLabel('標題',{exact:true})).toBeDisabled();
    await expect.poll(()=>typeof finishSave).toBe('function');
    await page.evaluate(async()=>{
        const {getClient}=await import('/backend.js');
        await (await getClient()).auth.signOut({scope:'local'});
    });
    await expect(page.locator('#login-panel')).toBeVisible();
    await finishSave();
    await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('tlsh-draft:')).length)).toBe(0);
    await expect(page.locator('#dashboard')).toBeHidden();
    await expect(page.locator('#login-status')).toContainText('安全登出');
});

test('department choices respond to clicks and keyboard on desktop and mobile',async({page})=>{
    const mock=await backend(page);
    mock.setContents([]);
    await page.goto('/admin/');
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    const group=page.getByRole('group',{name:'發布位置',exact:true});
    for(const width of [1280,390,320]) {
        await page.setViewportSize({width,height:844});
        for(const [value,{label}] of Object.entries(departments)) {
            await group.getByText(label,{exact:true}).click();
            await expect(group.getByRole('radio',{name:label,exact:true})).toBeChecked();
            await expect(group.locator('input:checked')).toHaveCount(1);
            expect(await page.locator('#content-form').evaluate(form=>new FormData(form).get('department'))).toBe(value);
        }
        expect(await page.locator('#content-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    }
    const pr=group.getByRole('radio',{name:'公關組',exact:true});
    await pr.focus();
    await page.keyboard.press('Space');
    await expect(pr).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio',{name:'學權組',exact:true})).toBeChecked();
    await page.getByLabel('標題',{exact:true}).fill('點選部門後儲存');
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
    expect(mock.calls.find(call=>call.method==='POST').body.department).toBe('rights');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await expect(group.getByRole('radio',{name:'學權組',exact:true})).toBeChecked();
});

test('published content keeps department choices read-only without publishing permission',async({page})=>{
    const mock=await backend(page,{...admin,role:'editor',can_publish:false});
    mock.setContents([{...article,status:'published',department:'pr'}]);
    await page.goto('/admin/');
    await page.getByRole('button',{name:'檢視',exact:true}).click();
    const group=page.getByRole('group',{name:'發布位置',exact:true});
    await expect(group.getByRole('radio',{name:'公關組',exact:true})).toBeChecked();
    for(const radio of await group.getByRole('radio').all()) await expect(radio).toBeDisabled();
    await expect(page.locator('#save-content')).toBeHidden();
    expect(mock.calls.some(call=>['POST','PATCH'].includes(call.method))).toBe(false);
});

test('staff can publish to one department, move the post, opt into home, and archive everywhere',async({page})=>{
    const mock=await backend(page);
    mock.setContents([]);
    await page.goto('/admin/');
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.getByLabel('標題',{exact:true}).fill('公關組專屬消息');
    await page.getByRole('radio',{name:'公關組',exact:true}).check();
    await page.getByLabel('同時顯示在首頁最新消息',{exact:true}).uncheck();
    await expect(page.locator('#publication-hint')).toHaveText('設為「已發布」後顯示於：公關組。');
    await page.getByLabel('內容狀態').selectOption('published');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#save-content').click();
    await expect(page.locator('#view-location')).toHaveAttribute('href',/\/pr\/$/);
    expect(mock.calls.find(call=>call.method==='POST').body).toMatchObject({department:'pr',show_on_home:false});
    await page.goto('/pr/');
    await expect(page.locator('.department-list h3')).toHaveText('公關組專屬消息');
    await page.goto('/rights/');
    await expect(page.locator('.department-status')).toContainText('目前尚無');
    await page.goto('/');
    await expect(page.locator('#announcement-status')).toContainText('目前沒有');
    await expect(page.locator('.news-card')).toHaveCount(0);
    await page.goto('/admin/');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await expect(page.getByRole('radio',{name:'公關組',exact:true})).toBeChecked();
    await page.getByRole('radio',{name:'學權組',exact:true}).check();
    await page.getByLabel('同時顯示在首頁最新消息',{exact:true}).check();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已發布');
    await page.goto('/pr/');
    await expect(page.locator('.department-status')).toContainText('目前尚無');
    await page.goto('/rights/');
    await expect(page.locator('.department-list h3')).toHaveText('公關組專屬消息');
    await page.goto('/');
    await expect(page.locator('.news-card h3')).toHaveText('公關組專屬消息');
    await page.goto('/admin/');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await page.getByLabel('內容狀態').selectOption('archived');
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已下架');
    await page.goto('/rights/');
    await expect(page.locator('.department-status')).toContainText('目前尚無');
    await page.goto('/');
    await expect(page.locator('#announcement-status')).toContainText('目前沒有');
});

test('meeting minutes can be written inline, published, read from the library, and updated',async({page})=>{
    const mock=await backend(page);
    mock.setContents([]);
    await page.goto('/admin/');
    await page.getByRole('button',{name:'新增會議紀錄',exact:true}).click();
    await expect(page.locator('#content-form').getByLabel('內容類型')).toHaveValue('document');
    await expect(page.getByRole('radio',{name:'文書組',exact:true})).toBeChecked();
    await page.getByLabel('標題',{exact:true}).fill('學生會第一次會議紀錄');
    await page.getByLabel('文件內文／會議紀錄（可直接輸入）').fill('出席人員：測試\n決議：<img src=x onerror=alert(1)>');
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
    await page.goto('/docs/');
    await expect(page.locator('#archive-status')).toContainText('目前尚無公開文件');
    await page.goto('/admin/');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await page.getByLabel('內容狀態').selectOption('published');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#save-content').click();
    await expect(page.locator('#view-published')).toHaveAttribute('href',`../announcement.html?id=${id}&kind=document`);
    await page.goto('/docs/');
    await expect(page.locator('.archive-item .title')).toHaveText('學生會第一次會議紀錄');
    await page.locator('.archive-item .download-link').click();
    await expect(page.locator('#article-body')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('#article-body img')).toHaveCount(0);
    await expect(page.locator('#article-back')).toHaveText('← 返回公開文件');
    await page.goto('/');
    await expect(page.locator('.news-card h3')).toHaveText('學生會第一次會議紀錄');
    await page.goto('/admin/');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await page.getByLabel('文件內文／會議紀錄（可直接輸入）').fill('更新後的正式紀錄');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已發布');
    await page.goto(`/announcement.html?id=${id}&kind=document`);
    await expect(page.locator('#article-body')).toHaveText('更新後的正式紀錄');
});

test('linked minutes remain accessible from their department, the library and optional home listing',async({page})=>{
    const mock=await backend(page);
    mock.setContents([]);
    await page.goto('/admin/');
    await page.getByRole('button',{name:'新增會議紀錄',exact:true}).click();
    await page.getByLabel('標題',{exact:true}).fill('公關協作會議紀錄');
    await page.getByRole('radio',{name:'公關組',exact:true}).check();
    await page.getByLabel('文件連結（已輸入內文時可不填）').fill('https://example.com/minutes.pdf');
    await page.getByLabel('內容狀態').selectOption('published');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#save-content').click();
    await expect(page.locator('#view-published')).toHaveAttribute('href','https://example.com/minutes.pdf');
    await page.goto('/pr/');
    await expect(page.locator('.department-list .news-card')).toHaveAttribute('href','https://example.com/minutes.pdf');
    await page.goto('/docs/');
    await expect(page.locator('.archive-item .download-link')).toHaveAttribute('href','https://example.com/minutes.pdf');
    await page.goto('/');
    await expect(page.locator('.news-card')).toHaveAttribute('href','https://example.com/minutes.pdf');
    await page.goto('/admin/');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await page.getByLabel('文件連結（已輸入內文時可不填）').fill('https://example.com/minutes-updated.pdf');
    await page.getByLabel('同時顯示在首頁最新消息',{exact:true}).uncheck();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已發布');
    await page.goto('/');
    await expect(page.locator('#announcement-status')).toContainText('目前沒有');
    await page.goto('/docs/');
    await expect(page.locator('.archive-item .download-link')).toHaveAttribute('href','https://example.com/minutes-updated.pdf');
    await page.goto('/pr/');
    await expect(page.locator('.department-list .news-card')).toHaveAttribute('href','https://example.com/minutes-updated.pdf');
});

test('each department page lists only its own published posts on mobile',async({page})=>{
    const mock=await backend(page,null,{session:false});
    const locations=['president','activities','pr','rights','design','docs','general'];
    mock.setContents(locations.flatMap((department,i)=>[
        {...article,id:`12345678-1234-4234-8234-${String(i).padStart(12,'0')}`,status:'published',department,show_on_home:false,title:`${department} 專屬內容`},
        {...article,department,status:'draft',title:'不可公開的草稿'},
    ]));
    await page.setViewportSize({width:320,height:844});
    for(const department of locations) {
        await page.goto(`/${department}/`);
        await expect(page.locator('.news-card h3')).toHaveText(`${department} 專屬內容`);
        await expect(page.locator('body')).not.toContainText('不可公開的草稿');
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    }
});

test('public pages keep reading old records while the locations migration is pending',async({page})=>{
    const mock=await backend(page,null,{session:false});
    mock.setContents([{...article,status:'published',category:'學生權益',title:'既有學權消息'}]);
    let fallback=0;
    await page.route('https://school.supabase.co/rest/v1/content*',route=>{
        if(new URL(route.request().url()).searchParams.get('select')?.includes('department')) {
            return route.fulfill({status:400,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({code:'42703',message:'column department does not exist'})});
        }
        fallback++;return route.fallback();
    });
    await page.goto('/rights/');
    await expect(page.locator('.department-list h3')).toHaveText('既有學權消息');
    await page.goto('/');
    await expect(page.locator('.news-card h3')).toHaveText('既有學權消息');
    expect(fallback).toBeGreaterThanOrEqual(2);
});

test('a pending schema update preserves editing and explains the required migration',async({page})=>{
    const mock=await backend(page);
    mock.setContents([]);
    let upgraded=false;
    await page.route('https://school.supabase.co/rest/v1/content*',route=>{
        if(route.request().method()==='POST'&&!upgraded) return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'PGRST204',message:'department column is missing'})});
        return route.fallback();
    });
    await page.goto('/admin/');
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.getByLabel('標題',{exact:true}).fill('保留編輯中的公關資料');
    await page.getByRole('radio',{name:'公關組',exact:true}).check();
    await page.locator('#save-content').click();
    await expect(page.locator('#editor-status')).toContainText('002_publication_locations.sql');
    await expect(page.getByLabel('標題',{exact:true})).toHaveValue('保留編輯中的公關資料');
    await expect(page.getByRole('radio',{name:'公關組',exact:true})).toBeChecked();
    upgraded=true;
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
});

test('urgent draft can be recovered and published to every page with a Taiwan deadline',async({page})=>{
    const mock=await backend(page);mock.setContents([]);
    await page.goto('/admin/');
    await page.getByRole('button',{name:'新增緊急通告',exact:true}).click();
    await expect(page.getByLabel('在全站頂端顯示緊急通告')).toBeChecked();
    await expect(page.getByLabel('內容狀態')).toHaveValue('draft');
    await page.getByLabel('標題',{exact:true}).fill('活動集合地點異動');
    await page.getByLabel('摘要',{exact:true}).fill('請改至行政大樓前集合。');
    await page.getByLabel('緊急提示結束時間（台灣時間）',{exact:true}).fill('2099-10-24T18:30');
    await page.locator('#editor-settings > summary').click();
    await page.getByRole('radio',{name:'公關組',exact:true}).check();
    await page.getByLabel('同時顯示在首頁最新消息',{exact:true}).uncheck();
    await page.reload();
    await page.getByRole('button',{name:'新增緊急通告',exact:true}).click();
    await page.getByRole('button',{name:'回復暫存',exact:true}).click();
    await expect(page.getByLabel('緊急提示結束時間（台灣時間）',{exact:true})).toHaveValue('2099-10-24T18:30');
    await page.locator('#save-content').click();
    expect(mock.calls.find(call=>call.method==='POST').body).toMatchObject({is_urgent:true,urgent_until:'2099-10-24T10:30:00.000Z',status:'draft',department:'pr',show_on_home:false});
    await page.goto('/rights/');
    await expect(page.getByRole('region',{name:'緊急通告',exact:true})).toBeHidden();
    await page.goto('/admin/');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await expect(page.getByLabel('緊急提示結束時間（台灣時間）',{exact:true})).toHaveValue('2099-10-24T18:30');
    await page.getByLabel('內容狀態').selectOption('published');
    page.once('dialog',async dialog=>{
        expect(dialog.message()).toContain('全站頂端'); await dialog.accept();
    });
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已發布');
    for(const path of ['/','/rights/','/docs/','/announcement.html?id='+id]) {
        await page.goto(path);
        await expect(page.locator('.urgent-title')).toHaveText('活動集合地點異動');
        await expect(page.locator('.urgent-meta')).toContainText('18:30');
    }
    await page.getByRole('link',{name:'查看詳情：活動集合地點異動'}).click();
    await expect(page.locator('#article-title')).toHaveText('活動集合地點異動');
    await page.goto('/admin/');
    await page.getByRole('button',{name:'編輯',exact:true}).click();
    await page.getByLabel('在全站頂端顯示緊急通告').uncheck();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已發布');
    expect(mock.calls.filter(call=>call.method==='PATCH').at(-1).body).toMatchObject({is_urgent:false,urgent_until:null});
    await page.goto('/rights/');
    await expect(page.getByRole('region',{name:'緊急通告',exact:true})).toBeHidden();
    await page.goto('/pr/');
    await expect(page.locator('.department-list h3')).toHaveText('活動集合地點異動');
});

const urgentFixture=overrides=>({...article,status:'published',is_urgent:true,urgent_until:'2099-10-24T10:30:00.000Z',updated_at:'2026-10-24T04:00:00Z',title:'緊急測試通告',...overrides});

test('urgent notices fit mobile, stay collapsed across pages, and reopen when content changes',async({page},testInfo)=>{
    const mock=await backend(page);
    mock.setContents([urgentFixture({title:'<img src=x onerror=alert(1)>緊急異動',summary:'集合地點變更，請查看詳情。'}),urgentFixture({id:'12345678-1234-4234-8234-123456789abd',title:'第二則緊急通告'})]);
    const banner=page.getByRole('region',{name:'緊急通告',exact:true});
    for(const width of [320,390,768,1440]) {
        await page.setViewportSize({width,height:844});await page.goto('/rights/');
        await expect(banner).toBeVisible();
        await expect(banner.locator('summary')).toContainText('2 則');
        expect(await banner.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
        await expect(banner.locator('img')).toHaveCount(0);
        if(width===390||width===1440) await page.screenshot({path:testInfo.outputPath(`urgent-${width}.png`)});
    }
    await banner.locator('summary').click();
    await expect(banner.locator('details')).not.toHaveAttribute('open','');
    await page.goto('/docs/');
    await expect(banner.locator('summary')).toContainText('2 則');
    await expect(banner.locator('details')).not.toHaveAttribute('open','');
    mock.setContents([urgentFixture({title:'更新的集合地點',updated_at:'2026-10-24T05:00:00Z'})]);
    await page.reload();
    await expect(banner.locator('details')).toHaveAttribute('open','');
    await expect(banner.locator('.urgent-title')).toHaveText('更新的集合地點');
});

test('urgent notice expires while the page remains open and archived notices disappear after refresh',async({page})=>{
    const now=Date.now();await page.clock.install({time:new Date(now)});
    const mock=await backend(page);
    mock.setContents([urgentFixture({urgent_until:new Date(now+10000).toISOString()})]);
    await page.goto('/rights/');
    await expect(page.locator('.urgent-title')).toHaveText('緊急測試通告');
    await page.clock.fastForward(11000);
    await expect(page.getByRole('region',{name:'緊急通告',exact:true})).toBeHidden();
    await expect(page.locator('.department-status')).toContainText('目前尚無');
    mock.setContents([urgentFixture({status:'archived'}),urgentFixture({status:'draft'}),urgentFixture({is_urgent:false}),urgentFixture({urgent_until:'2020-01-01T00:00:00Z'})]);
    await page.reload();
    await expect(page.getByRole('region',{name:'緊急通告',exact:true})).toBeHidden();
    expect(mock.calls.filter(call=>call.query.is_urgent==='eq.true').every(call=>call.query.status==='eq.published'&&call.query.kind==='eq.announcement'&&call.query.urgent_until.startsWith('gt.'))).toBe(true);
});

test('urgent reader handles missing schema, failed requests, retry and unavailable session storage',async({page})=>{
    const mock=await backend(page);mock.setContents([urgentFixture({})]);
    let mode='schema';
    await page.route('https://school.supabase.co/rest/v1/content*',route=>{
        if(new URL(route.request().url()).searchParams.get('is_urgent')!=='eq.true') return route.fallback();
        if(mode==='schema') return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'42703',message:'column is_urgent does not exist'})});
        if(mode==='offline') return route.fulfill({status:400,contentType:'application/json',body:'{"message":"network unavailable"}'});
        return route.fallback();
    });
    await page.goto('/rights/');
    await expect(page.getByRole('region',{name:'緊急通告',exact:true})).toBeHidden();
    mode='offline';await page.reload();
    await expect(page.locator('.urgent-error')).toContainText('暫時無法讀取');
    mode='online';
    await page.evaluate(()=>{Object.defineProperty(window,'sessionStorage',{value:{getItem(){throw new Error('storage blocked');},setItem(){throw new Error('storage blocked');},removeItem(){throw new Error('storage blocked');}}});});
    await page.getByRole('button',{name:'重試',exact:true}).click();
    await expect(page.locator('.urgent-title')).toHaveText('緊急測試通告');
    await page.locator('.urgent-banner summary').click();
    await expect(page.locator('.urgent-banner details')).not.toHaveAttribute('open','');
});

test('urgent editor explains missing migration and protects draft-only editors',async({page})=>{
    const mock=await backend(page,{...admin,role:'editor',can_publish:false});
    await page.route('https://school.supabase.co/rest/v1/content*',route=>route.request().method()==='POST'&&route.request().postDataJSON().is_urgent
        ? route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'PGRST204',message:'Could not find is_urgent column'})}) : route.fallback());
    await page.goto('/admin/');
    await page.getByRole('button',{name:'新增緊急通告',exact:true}).click();
    await page.getByLabel('標題',{exact:true}).fill('保留的緊急草稿');
    await expect(page.getByLabel('內容狀態').locator('option[value="published"]')).toHaveJSProperty('disabled',true);
    await page.locator('#save-content').click();
    await expect(page.locator('#editor-status')).toContainText('003_urgent_notices.sql');
    await expect(page.getByLabel('標題',{exact:true})).toHaveValue('保留的緊急草稿');
    await expect(page.getByLabel('在全站頂端顯示緊急通告')).toBeChecked();
    await page.getByLabel('在全站頂端顯示緊急通告').uncheck();
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
    expect(mock.calls.find(call=>call.method==='POST').body).not.toHaveProperty('is_urgent');
});

test('visible-page refresh reopens revised urgent notices and an outage cannot keep expired notices visible',async({page})=>{
    const now=Date.now();await page.clock.install({time:new Date(now)});
    const mock=await backend(page);
    const notice=urgentFixture({urgent_until:new Date(now+90000).toISOString()});
    mock.setContents([notice]);
    let offline=false;
    await page.route('https://school.supabase.co/rest/v1/content*',route=>offline&&new URL(route.request().url()).searchParams.get('is_urgent')==='eq.true'
        ? route.fulfill({status:400,contentType:'application/json',body:'{"message":"network unavailable"}'}) : route.fallback());
    await page.goto('/rights/');
    await expect(page.locator('.urgent-title')).toHaveText('緊急測試通告');
    await page.locator('.urgent-banner summary').click();
    await expect(page.locator('.urgent-banner details')).not.toHaveAttribute('open','');
    mock.setContents([{...notice,title:'更新後的緊急通告',updated_at:new Date(now+10000).toISOString()}]);
    await page.clock.fastForward(61000);
    await expect(page.locator('.urgent-title')).toHaveText('更新後的緊急通告');
    await expect(page.locator('.urgent-banner details')).toHaveAttribute('open','');
    offline=true;
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('.urgent-error')).toContainText('暫時無法確認');
    await page.clock.fastForward(30000);
    await expect(page.locator('.urgent-title')).toHaveCount(0);
    await expect(page.locator('.urgent-error')).toContainText('暫時無法讀取');
    offline=false;mock.setContents([]);
    await page.getByRole('button',{name:'重試',exact:true}).click();
    await expect(page.getByRole('region',{name:'緊急通告',exact:true})).toBeHidden();
});

test('reading links and form boundaries remain distinct on dark surfaces',async({page})=>{
    await page.goto('/activities/');
    const link=page.locator('.card a[href^="mailto:"]');
    const colors=await link.evaluate(e=>({text:getComputedStyle(e).color,bg:getComputedStyle(e.closest('.card')).backgroundColor}));
    expect(contrastRatio(colors.text,colors.bg)).toBeGreaterThanOrEqual(4.5);
    await page.goto('/docs/');
    await page.locator('.archive-item').waitFor();
    const input=await page.locator('#document-search').evaluate(e=>({border:getComputedStyle(e).borderTopColor,bg:getComputedStyle(e).backgroundColor}));
    expect(contrastRatio(input.border,input.bg)).toBeGreaterThanOrEqual(3);
    await backend(page);await page.goto('/admin/');
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    const fieldColors=await page.getByLabel('標題',{exact:true}).evaluate(e=>({border:getComputedStyle(e).borderTopColor,surface:getComputedStyle(e.closest('dialog')).backgroundColor}));
    expect(contrastRatio(fieldColors.border,fieldColors.surface)).toBeGreaterThanOrEqual(3);
    for(const target of ['.content-preview > summary','.check-label','#close-editor']) {
        const height=await page.locator('#content-dialog').locator(target).first().evaluate(e=>e.getBoundingClientRect().height);
        expect(height).toBeGreaterThanOrEqual(44);
    }
});

test('press feedback is immediate, cancellable and remains available with reduced motion',async({page})=>{
    await page.goto('/');
    for(const reducedMotion of ['no-preference','reduce']) {
        await page.emulateMedia({reducedMotion});
        const link=page.getByRole('link',{name:'查看最新消息'});
        await link.hover();await page.waitForTimeout(200);
        const before=await link.evaluate(e=>getComputedStyle(e).filter);
        await page.mouse.down();
        const pressed=await link.evaluate(e=>({filter:getComputedStyle(e).filter,transition:getComputedStyle(e).transitionDuration}));
        expect(pressed.filter).not.toBe(before);
        expect(parseFloat(pressed.transition)).toBeLessThan(.02);
        await page.mouse.move(0,0);await page.mouse.up();
        await expect(page).toHaveURL(/\/$/);
    }
    // Keyboard users keep their focus cue and native activation.
    await page.getByRole('link',{name:'查看最新消息'}).focus();
    await expect(page.getByRole('link',{name:'查看最新消息'})).toBeFocused();
    await page.keyboard.press('Enter');await expect(page).toHaveURL(/#announcements$/);
});

test('text preference doubles headings and inputs without overlapping mobile navigation',async({page})=>{
    for(const path of ['/','/activities/','/pr/','/rights/','/design/','/docs/','/general/','/president/','/privacy.html']) {
        await page.setViewportSize({width:320,height:844});await page.goto(path);
        await page.locator('.site-brand').waitFor();
        const baseline=await page.locator('h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
        await page.addStyleTag({content:'html { font-size:200% !important; }'});
        expect(await page.locator('h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(baseline*1.9);
        const boxes=await page.evaluate(()=>{
            const brand=document.querySelector('.site-brand').getBoundingClientRect(),staff=document.querySelector('.staff-link').getBoundingClientRect();
            return {brandRight:brand.right,staffLeft:staff.left,body:document.documentElement.scrollWidth,width:innerWidth};
        });
        expect(boxes.brandRight).toBeLessThanOrEqual(boxes.staffLeft);
        expect(boxes.body,path).toBeLessThanOrEqual(boxes.width);
    }
    await backend(page);await page.goto('/admin/');
    await page.addStyleTag({content:'html { font-size:200% !important; }'});
    await page.getByRole('button',{name:'新增緊急通告',exact:true}).click();
    expect(await page.getByLabel('標題',{exact:true}).evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBe(32);
    expect(await page.locator('#content-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

test('urgent editor starts with the task, saves collapsed defaults, and reveals invalid advanced fields',async({page},testInfo)=>{
    await page.setViewportSize({width:390,height:844});
    const mock=await backend(page);mock.setContents([]);
    await page.goto('/admin/');await page.getByRole('button',{name:'新增緊急通告',exact:true}).click();
    await expect(page.getByRole('heading',{name:'新增緊急通告',exact:true})).toBeVisible();
    await expect(page.getByLabel('標題',{exact:true})).toBeFocused();
    await expect(page.locator('#editor-settings')).not.toHaveAttribute('open','');
    const positions=await page.evaluate(()=>{
        const form=document.getElementById('content-form'),top=name=>form.elements.namedItem(name).getBoundingClientRect().top;
        return {title:top('title'),summary:top('summary'),deadline:top('urgent_until'),status:top('status'),viewport:innerHeight};
    });
    expect(positions.title).toBeLessThan(positions.summary);
    expect(positions.summary).toBeLessThan(positions.deadline);
    expect(positions.deadline).toBeLessThan(positions.status);
    expect(positions.title).toBeLessThan(positions.viewport);
    await page.screenshot({path:testInfo.outputPath('urgent-editor-390.png')});
    await page.getByLabel('標題',{exact:true}).fill('第一輪改善驗證');
    // A recovered or edited invalid URL may be in the closed advanced section.
    await page.locator('input[name="url"]').evaluate(e=>{e.value='http://example.com/invalid';});
    await page.locator('#save-content').click();
    await expect(page.locator('#editor-settings')).toHaveAttribute('open','');
    await expect(page.locator('input[name="url"]')).toBeFocused();
    expect(mock.calls.some(call=>call.method==='POST')).toBe(false);
    await page.getByLabel('相關連結（選填）',{exact:true}).fill('https://example.com/info');
    await page.locator('#editor-settings > summary').click();
    await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
    expect(mock.calls.find(call=>call.method==='POST').body).toMatchObject({is_urgent:true,department:'union',status:'draft',url:'https://example.com/info'});
});

test('navigation reflects section changes and index.html aliases',async({page})=>{
    await page.goto('/index.html#announcements');
    await expect(page.getByRole('link',{name:'最新消息',exact:true}).first()).toHaveAttribute('aria-current','location');
    await page.evaluate(()=>{location.hash='departments';});
    await expect(page.getByRole('link',{name:'最新消息',exact:true}).first()).not.toHaveAttribute('aria-current');
    await page.goto('/president/index.html#feedback');
    const feedback=page.getByRole('link',{name:'意見回饋',exact:true}).first();
    await expect(feedback).toHaveAttribute('aria-current','location');
    expect(await feedback.evaluate(e=>getComputedStyle(e).textDecorationLine)).toContain('underline');
    await page.goto('/docs/index.html');
    await expect(page.getByRole('link',{name:'公開文件',exact:true}).first()).toHaveAttribute('aria-current','page');
});

test('article errors offer an in-place retry while unavailable content stays private',async({page})=>{
    const mock=await backend(page);mock.setContents([{...article,status:'published'}]);
    let offline=true,attempts=0;
    await page.route('https://school.supabase.co/rest/v1/content*',route=>{
        if(!new URL(route.request().url()).searchParams.get('id')) return route.fallback();
        attempts++;
        return offline ? route.fulfill({status:400,contentType:'application/json',body:'{"message":"temporarily unavailable"}'}) : route.fallback();
    });
    await page.goto(`/announcement.html?id=${id}`);
    await expect(page.locator('#article-status')).toContainText('目前無法讀取');
    await expect(page.locator('#article')).toBeHidden();
    offline=false;
    await page.getByRole('button',{name:'重新載入',exact:true}).click();
    await expect(page.locator('#article-title')).toHaveText(article.title);
    await expect(page.locator('#article-feedback')).toBeHidden();
    expect(attempts).toBe(2);
    mock.setContents([]);await page.reload();
    await expect(page.locator('#article-status')).toContainText('未公開');
    await expect(page.locator('#article-retry')).toBeHidden();
    await expect(page.locator('#article')).toBeHidden();
    await page.goto('/announcement.html?id=invalid');
    await expect(page.locator('#article-status')).toContainText('連結無效');
    await expect(page.locator('#article-retry')).toBeHidden();
});

test('static cards and document rows remain still while typography and control shapes agree',async({page})=>{
    await page.setViewportSize({width:1440,height:900});
    await page.goto('/pr/');
    const heading=await page.locator('h1').evaluate(e=>{const s=getComputedStyle(e);return {size:parseFloat(s.fontSize),tracking:parseFloat(s.letterSpacing),weight:+s.fontWeight};});
    expect(heading.tracking/heading.size).toBeLessThanOrEqual(.05);
    expect(heading.weight).toBeGreaterThanOrEqual(500);
    const card=page.locator('.card').first();
    await card.hover();await page.waitForTimeout(200);
    expect(await card.evaluate(e=>getComputedStyle(e).transform)).toBe('none');
    await page.goto('/design/');const designRadius=await page.locator('.info-card').first().evaluate(e=>getComputedStyle(e).borderTopLeftRadius);
    await page.goto('/general/');expect(await page.locator('.info-card').first().evaluate(e=>getComputedStyle(e).borderTopLeftRadius)).toBe(designRadius);
    await page.goto('/docs/');await page.locator('.archive-item').waitFor();
    const link=page.locator('.download-link').first(),before=await link.boundingBox();
    await page.locator('.archive-item').first().hover();await page.waitForTimeout(200);
    const after=await link.boundingBox();expect(Math.abs(after.x-before.x)).toBeLessThan(.5);
    const docsRadius=await page.locator('#document-search').evaluate(e=>getComputedStyle(e).borderTopLeftRadius);
    await backend(page);await page.goto('/admin/');await page.getByRole('button',{name:'＋ 新增內容'}).click();
    expect(await page.getByLabel('標題',{exact:true}).evaluate(e=>getComputedStyle(e).borderTopLeftRadius)).toBe(docsRadius);
});

test('transparency and contrast preferences provide solid navigation and dialog surfaces',async({page})=>{
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    await page.goto('/');await page.locator('.sitebar').waitFor();
    expect(await page.evaluate(()=>matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
    expect(await page.locator('.sitebar').evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('none');
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-contrast',value:'more'}]});
    expect(await page.evaluate(()=>matchMedia('(prefers-contrast: more)').matches)).toBe(true);
    const barColors=await page.locator('.sitebar').evaluate(e=>({border:getComputedStyle(e).borderBottomColor,bg:getComputedStyle(e).backgroundColor}));
    expect(contrastRatio(barColors.border,barColors.bg)).toBeGreaterThanOrEqual(3);
    await backend(page);await page.goto('/admin/');await page.getByRole('button',{name:'＋ 新增內容'}).click();
    expect(await page.locator('#content-dialog').evaluate(e=>getComputedStyle(e,'::backdrop').backdropFilter)).toBe('none');
});

test('editor actions stay reachable on long forms and urgent labels match their state',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    const mock=await backend(page);
    await page.goto('/admin/');await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.locator('#content-dialog').evaluate(e=>{e.scrollTop=e.scrollHeight;});
    const boxes=await page.evaluate(()=>{
        const bounds=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom};};
        return {dialog:bounds('content-dialog'),close:bounds('close-editor'),save:bounds('save-content')};
    });
    expect(boxes.close.top).toBeGreaterThanOrEqual(boxes.dialog.top);
    expect(boxes.close.bottom).toBeLessThanOrEqual(boxes.dialog.bottom);
    expect(boxes.save.bottom).toBeLessThanOrEqual(boxes.dialog.bottom);
    await page.getByRole('button',{name:'關閉',exact:true}).click();
    mock.setContents([urgentFixture({summary:'這是需要查看全文的長摘要。'.repeat(30)})]);
    await page.goto('/rights/');await page.locator('.urgent-title').waitFor();
    await expect(page.locator('.urgent-toggle-hint')).toContainText('收合');
    const summary=await page.locator('.urgent-summary').evaluate(e=>({height:e.clientHeight,line:parseFloat(getComputedStyle(e).lineHeight),overflow:getComputedStyle(e).overflowY}));
    expect(summary.height).toBeLessThanOrEqual(summary.line*2+1);
    expect(summary.overflow).toBe('hidden');
    await page.locator('.urgent-banner summary').click();await expect(page.locator('.urgent-toggle-hint')).toContainText('展開');
    await page.locator('.urgent-banner summary').click();await expect(page.locator('.urgent-toggle-hint')).toContainText('收合');
});

test('inline field errors identify each problem, preserve text, and reveal closed settings',async({page},testInfo)=>{
    const mock=await backend(page);
    await page.goto('/admin/');await page.getByRole('button',{name:'＋ 新增內容'}).click();
    const title=page.getByLabel('標題',{exact:true});
    await title.fill(' ');await title.press('Tab');
    await expect(title).toHaveAttribute('aria-invalid','true');
    await expect(title).toHaveAttribute('aria-describedby','content-error-title');
    await expect(page.locator('#content-error-title')).toContainText('標題必填');
    await title.fill('會議公告');
    await expect(title).not.toHaveAttribute('aria-invalid');
    await expect(page.locator('[data-counter="title"]')).toHaveText('4 / 160');
    await page.getByLabel('類別',{exact:true}).selectOption('__custom__');
    await page.getByLabel('自訂類別',{exact:true}).focus();await page.keyboard.press('Tab');
    await expect(page.locator('#custom-category')).toHaveAttribute('aria-invalid','true');
    await page.getByLabel('自訂類別',{exact:true}).fill('會務');
    await expect(page.locator('#custom-category')).not.toHaveAttribute('aria-invalid');
    await page.getByLabel('相關連結（選填）',{exact:true}).fill('http://example.com');await page.keyboard.press('Tab');
    await expect(page.locator('#content-error-url')).toContainText('HTTPS');
    await page.locator('#editor-settings > summary').click();await page.locator('#save-content').click();
    await expect(page.locator('#editor-settings')).toHaveAttribute('open','');
    await expect(page.getByLabel('相關連結（選填）',{exact:true})).toBeFocused();
    await expect(title).toHaveValue('會議公告');
    expect(mock.calls.some(call=>call.method==='POST')).toBe(false);
    await page.screenshot({path:testInfo.outputPath('inline-errors.png')});
    await page.getByLabel('相關連結（選填）',{exact:true}).fill('https://example.com');
    await expect(page.locator('#content-error-url')).toHaveCount(0);
    await expect(page.locator('#editor-status')).toHaveText('');
    await page.getByRole('button',{name:'儲存草稿',exact:true}).click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
});

test('restored drafts refresh error descriptions and action labels remain readable at larger text sizes',async({page})=>{
    await backend(page);
    await page.goto('/admin/');await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.getByLabel('標題',{exact:true}).fill('回復草稿');
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'關閉',exact:true}).click();
    await page.getByRole('button',{name:'＋ 新增內容'}).click();
    await page.getByLabel('標題',{exact:true}).press('Tab');
    await expect(page.getByLabel('標題',{exact:true})).toHaveAttribute('aria-invalid','true');
    await page.getByRole('button',{name:'回復暫存',exact:true}).click();
    await expect(page.getByLabel('標題',{exact:true})).toHaveValue('回復草稿');
    await expect(page.getByLabel('標題',{exact:true})).not.toHaveAttribute('aria-invalid');
    await page.getByRole('button',{name:'儲存草稿',exact:true}).click();
    await expect(page.locator('#dashboard-status')).toContainText('草稿已儲存');
    await page.getByRole('button',{name:'編輯',exact:true}).first().click();
    await page.getByLabel('內容狀態').selectOption('published');
    await expect(page.locator('#save-content')).toHaveText('發布內容');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#save-content').click();
    await expect(page.locator('#dashboard-status')).toContainText('已發布');
    await page.setViewportSize({width:320,height:844});
    await page.addStyleTag({content:'html { font-size:200% !important; }'});
    await page.getByRole('button',{name:'編輯',exact:true}).first().click();
    await expect(page.locator('#save-content')).toHaveText('儲存並公開更新');
    expect(await page.locator('#content-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await page.getByLabel('內容狀態').selectOption('archived');
    await expect(page.locator('#save-content')).toHaveText('下架內容');
});

test('public content copies canonical announcement and minutes links without extra parameters',async({page})=>{
    const mock=await backend(page);
    mock.setContents([{...article,status:'published'},{...article,id:'12345678-1234-4234-8234-123456789abd',kind:'document',status:'published',body:'會議紀錄'}]);
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedArticleLink=text;}}}));
    for(const [contentId,kind] of [[id,'announcement'],['12345678-1234-4234-8234-123456789abd','document']]) {
        await page.goto(`/announcement.html?id=${contentId}&kind=${kind}&utm_source=class-chat#unused`);
        await expect(page.locator('#article-title')).toHaveText(article.title);
        await page.getByRole('button',{name:'複製連結',exact:true}).click();
        await expect(page.locator('#article-copy-status')).toContainText('連結已複製');
        const copied=new URL(await page.evaluate(()=>window.copiedArticleLink));
        expect(copied.searchParams.get('id')).toBe(contentId);
        expect(copied.searchParams.get('kind')).toBe(kind==='document'?'document':null);
        expect([...copied.searchParams.keys()].sort()).toEqual(kind==='document'?['id','kind']:['id']);
        expect(copied.hash).toBe('');
    }
});

test('copy denial provides a selected manual link and unavailable content offers no share action',async({page})=>{
    const mock=await backend(page);mock.setContents([{...article,status:'published'}]);
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('permission denied');}}}));
    await page.goto(`/announcement.html?id=${id}`);await expect(page.locator('#article-title')).toHaveText(article.title);
    await page.getByRole('button',{name:'複製連結',exact:true}).click();
    const fallback=page.getByLabel('選取或長按下方網址後複製',{exact:true});
    await expect(fallback).toBeVisible();await expect(fallback).toBeFocused();await expect(fallback).toHaveAttribute('readonly');
    expect(new URL(await fallback.inputValue()).searchParams.get('id')).toBe(id);
    mock.setContents([]);await page.reload();
    await expect(page.locator('#article-status')).toContainText('未公開');
    await expect(page.getByRole('button',{name:'複製連結',exact:true})).toBeHidden();
});

test('appearance persists across navigation and reloads without changing authentication storage',async({page})=>{
    await backend(page);
    await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await page.getByRole('button',{name:'切換為白色版',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    expect(await page.evaluate(()=>localStorage.getItem('tlsh-appearance'))).toBe('light');
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#f7f7f4');
    await page.getByRole('link',{name:'公開文件',exact:true}).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    expect(await page.evaluate(()=>Boolean(localStorage.getItem('sb-school-auth-token')))).toBe(true);
    await page.getByRole('button',{name:'切換為黑金版',exact:true}).focus();await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

test('appearance still switches when browser storage is unavailable',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
        const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
        Storage.prototype.getItem=function(key){if(key==='tlsh-appearance')throw new Error('blocked');return get.call(this,key);};
        Storage.prototype.setItem=function(key,value){if(key==='tlsh-appearance')throw new Error('blocked');return set.call(this,key,value);};
    });
    await page.goto('/');await page.getByRole('button',{name:'切換為白色版',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    await page.getByRole('button',{name:'切換為黑金版',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    expect(errors).toEqual([]);
});

test('white appearance covers every public page and editor with readable controls',async({page},testInfo)=>{
    const mock=await backend(page);
    mock.setContents([{...article,status:'published'},{...article,id:'12345678-1234-4234-8234-123456789abd',kind:'document',body:'公開會議紀錄',status:'published'}, {...article,id:'12345678-1234-4234-8234-123456789abe',title:'緊急測試',status:'published',is_urgent:true,urgent_until:new Date(Date.now()+86400000).toISOString()}]);
    await page.addInitScript(()=>localStorage.setItem('tlsh-appearance','light'));
    for(const width of [390,1440]) {
        await page.setViewportSize({width,height:900});
        for(const path of ['/','/activities/','/pr/','/rights/','/design/','/general/','/president/','/docs/','/privacy.html',`/announcement.html?id=${id}`,'/admin/']) {
            await page.goto(path);await expect(page.locator('html')).toHaveAttribute('data-theme','light');
            await page.locator('.theme-toggle').waitFor();
            const colors=await page.evaluate(()=>({text:getComputedStyle(document.body).color,bg:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth}));
            expect(colors.bg,path).toBe('rgb(247, 247, 244)');
            expect(contrastRatio(colors.text,colors.bg),path).toBeGreaterThanOrEqual(4.5);
            expect(colors.overflow,path).toBe(false);
            for(const selector of ['.card p','.info-card p','.news-card h3','.download-link','.form-privacy','#article-summary','.login-card > p','.antique-quote p']) {
                for(const element of await page.locator(selector).all()) {
                    if(!await element.isVisible())continue;
                    const color=await element.evaluate(e=>getComputedStyle(e).color);
                    expect(contrastRatio(color,'rgb(255, 255, 255)'),`${path} ${selector}`).toBeGreaterThanOrEqual(4.5);
                }
            }
            if(path==='/')await page.screenshot({path:testInfo.outputPath(`white-home-${width}.png`)});
        }
        await page.getByRole('button',{name:'＋ 新增內容'}).click();
        const title=page.getByLabel('標題',{exact:true});
        await title.press('Tab');await expect(title).toHaveAttribute('aria-invalid','true');
        const input=await title.evaluate(e=>({bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderColor}));
        expect(contrastRatio(input.border,input.bg)).toBeGreaterThanOrEqual(3);
        const error=await page.locator('#content-error-title').evaluate(e=>getComputedStyle(e).color);
        expect(contrastRatio(error,'rgb(247, 247, 242)')).toBeGreaterThanOrEqual(4.5);
        await title.fill('預覽用公告');
        const control=await title.evaluate(e=>({text:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderColor}));
        expect(contrastRatio(control.text,control.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(control.border,control.bg)).toBeGreaterThanOrEqual(3);
        await page.screenshot({path:testInfo.outputPath(`white-editor-${width}.png`)});
    }
});

test('white appearance supports larger text and contrast or transparency preferences',async({page})=>{
    await backend(page);await page.addInitScript(()=>localStorage.setItem('tlsh-appearance','light'));
    await page.setViewportSize({width:320,height:900});
    for(const path of ['/','/docs/','/president/','/admin/']) {
        await page.goto(path);await page.locator('.theme-toggle').waitFor();
        await page.addStyleTag({content:'html { font-size:200% !important; }'});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
        const size=await page.locator('.theme-toggle').boundingBox();expect(size.height).toBeGreaterThanOrEqual(44);expect(size.width).toBeGreaterThanOrEqual(44);
    }
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-contrast',value:'more'},{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-reduced-transparency',value:'reduce'}]});
    await expect.poll(()=>page.locator('.sitebar').evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('none');
    const styles=await page.locator('.sitebar').evaluate(e=>({border:getComputedStyle(e).borderBottomColor,bg:getComputedStyle(e).backgroundColor,blur:getComputedStyle(e).backdropFilter}));
    expect(styles.blur).toBe('none');expect(contrastRatio(styles.border,styles.bg)).toBeGreaterThanOrEqual(3);
    await page.getByRole('button',{name:'切換為黑金版',exact:true}).click();
    expect(await page.locator('body').evaluate(e=>getComputedStyle(e).transitionDuration.split(',').every(value=>parseFloat(value)<=.00001))).toBe(true);
});

test('published articles get clean metadata and unavailable content is excluded after loading',async({page})=>{
    const mock=await backend(page);mock.setContents([{...article,title:'<script>無法執行</script>',status:'published'}]);
    await page.goto(`/announcement.html?id=${id}&utm_source=chat#unused`);
    await expect(page.locator('#article-title')).toHaveText('<script>無法執行</script>');
    expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe(`https://tlshstudent-max.github.io/tlsh-student-union.github.io/announcement.html?id=${id}`);
    expect(await page.locator('meta[name=robots]').getAttribute('content')).toContain('index, follow');
    expect(await page.locator('meta[name=description]').getAttribute('content')).toBe(article.summary);
    const data=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(data.headline).toBe('<script>無法執行</script>');
    mock.setContents([]);await page.reload();await expect(page.locator('#article-status')).toContainText('未公開');
    expect(await page.locator('meta[name=robots]').getAttribute('content')).toBe('noindex, follow');
    await expect(page.locator('link[rel=canonical]')).toHaveCount(0);
});

test('feedback has contained spacing, a message-first flow, and responsive columns in both appearances',async({page},testInfo)=>{
    for(const theme of ['dark','light']) {
        await page.goto('/president/#feedback');
        if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('.theme-toggle').click();
        for(const width of [1440,390,320]) {
            await page.setViewportSize({width,height:900});
            await page.locator('#feedback').scrollIntoViewIfNeeded();
            await expect(page.locator('#fs-status')).toBeEmpty();
            const card=await page.locator('.feedback-card').boundingBox(),intro=await page.locator('.feedback-intro').boundingBox();
            const message=await page.getByLabel('你的意見',{exact:true}).boundingBox(),email=await page.getByLabel('聯絡信箱（選填，供本案回覆）').boundingBox();
            expect(message.x-card.x).toBeGreaterThanOrEqual(19);
            expect(card.x+card.width-message.x-message.width).toBeGreaterThanOrEqual(19);
            expect(message.y-card.y).toBeLessThan(100);
            expect(message.y).toBeLessThan(email.y);
            if(width===1440) expect(intro.x+intro.width).toBeLessThan(card.x);
            else expect(intro.y+intro.height).toBeLessThan(card.y);
            expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
            if(width!==320) await page.screenshot({path:testInfo.outputPath(`feedback-${theme}-${width}.png`)});
        }
        await page.addStyleTag({content:'html { font-size:200% !important; }'});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        const button=await page.locator('#submit-btn').boundingBox();expect(button.height).toBeGreaterThanOrEqual(44);
        await page.reload();
    }
});

test('glass surfaces retain readable fields and become solid for transparency preferences',async({page})=>{
    for(const theme of ['dark','light']) {
        await page.goto('/president/#feedback');
        if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle').click();
        await expect.poll(()=>page.locator('.feedback-card').evaluate(e=>getComputedStyle(e).backdropFilter)).toContain('blur');
        const input=await page.locator('#feedback-message').evaluate(e=>({text:getComputedStyle(e).color,border:getComputedStyle(e).borderColor,bg:getComputedStyle(e).backgroundColor}));
        expect(contrastRatio(input.text,input.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(input.border,input.bg)).toBeGreaterThanOrEqual(3);
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
        for(const selector of ['.sitebar','.feedback-card']) {
            await expect.poll(()=>page.locator(selector).evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('none');
            const bg=await page.locator(selector).evaluate(e=>getComputedStyle(e).backgroundColor);
            expect(bg).toMatch(/^rgb\(/);
        }
        await cdp.send('Emulation.setEmulatedMedia',{features:[]});await cdp.detach();
    }
});

test('button press feedback is immediate, cancellable, and respects reduced motion without submitting',async({page})=>{
    let sends=0;await page.route('https://formspree.io/**',route=>{sends++;return route.fulfill({contentType:'application/json',body:'{}'});});
    await page.goto('/president/#feedback');await page.getByLabel('你的意見',{exact:true}).fill('保留中的意見');
    const button=page.locator('#submit-btn');await button.scrollIntoViewIfNeeded();
    const box=await button.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    expect(await button.evaluate(e=>getComputedStyle(e).scale)).toBe('0.975');
    await page.mouse.move(5,5);await page.mouse.up();
    await expect.poll(()=>button.evaluate(e=>getComputedStyle(e).scale)).toBe('1');
    expect(sends).toBe(0);await expect(page.getByLabel('你的意見',{exact:true})).toHaveValue('保留中的意見');
    await page.emulateMedia({reducedMotion:'reduce'});await button.scrollIntoViewIfNeeded();
    const target=await button.boundingBox();await page.mouse.move(target.x+target.width/2,target.y+target.height/2);await page.mouse.down();
    expect(await button.evaluate(e=>getComputedStyle(e).scale)).toBe('1');
    await page.mouse.move(5,5);await page.mouse.up();expect(sends).toBe(0);
});
