import { getClient, isConfigured } from '../backend.js';
import { validateContent, mayEdit, mayPublish, safeHttpsUrl } from '../lib/content.js';
import { createDraftStore } from '../lib/drafts.js';
import { siteConfig } from '../site-config.js';

const $ = id => document.getElementById(id);
const form = $('content-form'), memberForm = $('member-form'), dialog = $('content-dialog');
const labels = { announcement: '公告', document: '公開文件', draft: '草稿', published: '已發布', archived: '已下架', admin: '管理員', editor: '編輯者' };
let client, member, sessionUser, contents = [], editing = null, dirty = false, saving = false, generation = 0;
let draftStore = null, recoverableDraft = null;
const categories = {
    announcement: ['學生會公告', '校園活動', '學生權益', '行政公告'],
    document: ['會議紀錄', '組織章程', '預算決算', '行政文件'],
};

function notice(id, text, state = '') {
    $(id).textContent = text;
    $(id).className = `notice ${state}`;
}
function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}
function field(name) { return form.elements.namedItem(name); }
function categoryValue() { return field('category').value === '__custom__' ? $('custom-category').value : field('category').value; }
function editorValues() { return { ...Object.fromEntries(new FormData(form)), category: categoryValue() }; }
function setCategories(kind, value = categories[kind][0]) {
    field('category').replaceChildren(...categories[kind].map(text => new Option(text, text)), new Option('其他（自行輸入）', '__custom__'));
    const custom = !categories[kind].includes(value);
    field('category').value = custom ? '__custom__' : value;
    $('custom-category').value = custom ? value : '';
}
function saveLocalDraft() {
    if (!member || !dialog.open || !dirty || saving || $('save-content').hidden) return;
    const saved = draftStore?.save(editing?.id, editorValues(), editing?.version ?? null);
    const message = saved ? '已暫存於此瀏覽器，尚未儲存到後台。' : '此瀏覽器目前無法暫存，請按「儲存內容」保留編輯。';
    if ($('draft-status').textContent !== message) notice('draft-status', message, saved ? '' : 'error');
}
function displayError(error) {
    if (error?.code === '42501') return '目前帳號沒有這項操作權限。若權限剛有異動，請重新登入。';
    if (error?.code === '23514' && error.message?.includes('administrator')) return '必須保留至少一位啟用中的管理員。請先授權另一位管理員，再調整此帳號。';
    if (error?.code === '23514' || error?.code === '22023') return '資料格式不符，請檢查必填欄位與網址。';
    if (['42P01', 'PGRST202', 'PGRST205'].includes(error?.code)) return '管理系統尚未完成啟用，請聯絡學生會管理員。';
    return '操作未完成，請確認網路連線後再試。未儲存的內容仍保留在畫面中。';
}

function showLogin(message, session = null, state = '') {
    const hasSession = Boolean(session?.user);
    member = null; contents = []; sessionUser = null;
    draftStore = null; recoverableDraft = null;
    $('dashboard').hidden = true;
    $('login-panel').hidden = false;
    $('google-login').hidden = hasSession;
    $('google-login').disabled = !isConfigured;
    $('login-signout').hidden = !hasSession;
    $('login-identity').hidden = !hasSession;
    $('login-identity').textContent = hasSession ? `目前登入：${session.user.email || 'Google 帳號'}` : '';
    if (dialog.open) { dirty = false; dialog.close(); }
    notice('login-status', message, state);
}

function loginError(error) {
    const codes = [error?.code, error?.details?.code, error?.details?.error];
    if (codes.includes('callback_session_missing')) return '未能接收這次登入驗證。請在同一個瀏覽器，從下方按鈕重新登入，並允許本站儲存登入資料。';
    if (['flow_state_expired', 'flow_state_not_found', 'bad_code_verifier', 'pkce_code_verifier_not_found'].some(code => codes.includes(code))) return '登入驗證已失效。請在同一個瀏覽器，從下方按鈕重新登入，不要重複開啟舊的登入連結。';
    if (codes.includes('access_denied')) return 'Google 尚未完成授權。請重新登入；若 Google 顯示測試使用者限制，請聯絡管理員加入測試名單。';
    return 'Google 登入未完成，請重新嘗試。若持續發生，請管理員檢查 Supabase 的 Google 登入與回呼網址設定。';
}

// Keep callback credentials out of the address bar after processing, including failures.
const callbackKeys = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description', 'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'expires_in', 'expires_at', 'token_type', 'type'];
const callbackMarkers = ['code', 'error', 'error_code', 'error_description', 'access_token'];
function callbackParameters(url) {
    const hash = new URLSearchParams(url.hash.slice(1));
    return callbackMarkers.some(key => url.searchParams.has(key) || hash.has(key));
}
function clearCallbackParameters() {
    const url = new URL(location.href), hash = new URLSearchParams(url.hash.slice(1));
    const authHash = callbackMarkers.some(key => hash.has(key));
    for (const key of callbackKeys) { url.searchParams.delete(key); if (authHash) hash.delete(key); }
    if (authHash) url.hash = hash.toString();
    history.replaceState(history.state, '', url.href);
}

async function enterSession(session) {
    const current = ++generation;
    if (!session?.user?.email) { showLogin('只有已獲授權的幹部可以進入工作台。'); return; }
    try {
        const { data, error } = await client.from('staff_members').select('*')
            .eq('email', session.user.email.toLowerCase()).maybeSingle().abortSignal(AbortSignal.timeout(12000));
        if (current !== generation) return;
        if (error) throw error;
        if (!data?.active) { showLogin('這個帳號尚未獲授權，或已停用。請聯絡學生會管理員。', session); return; }
        member = data; sessionUser = session.user;
        try { draftStore = createDraftStore(localStorage, siteConfig.supabaseUrl, member.email); } catch { draftStore = null; }
        $('login-panel').hidden = true;
        $('dashboard').hidden = false;
        $('identity').textContent = `${member.email} · ${labels[member.role]}`;
        $('new-content').disabled = !mayEdit(member, 'announcement') && !mayEdit(member, 'document');
        for (const panel of ['members-panel', 'audit-panel']) {
            document.querySelector(`[data-panel="${panel}"]`).hidden = member.role !== 'admin';
            $(panel).hidden = true;
        }
        selectPanel('content-panel');
        notice('dashboard-status', '');
        $('view-published').hidden = true;
        await loadContent();
    } catch (error) {
        if (current === generation) showLogin(displayError(error), session, 'error');
    }
}

// Callbacks must not await Supabase operations while the SDK auth lock is held.
async function initialize() {
    if (!isConfigured) { showLogin('後台尚未啟用。公開網站可正常瀏覽，幹部登入將於設定完成後開放。'); return; }
    const hasCallback = callbackParameters(new URL(location.href));
    let restoredSession = null;
    try {
        client = await getClient();
        // getSession() waits for initialization but does not return callback exchange errors.
        const { error: callbackError } = await client.auth.initialize();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        restoredSession = data.session;
        client.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') { generation += 1; showLogin('你已安全登出。'); }
            else if (event === 'SIGNED_IN' && session?.user?.id !== sessionUser?.id) {
                setTimeout(() => enterSession(session), 0);
            }
        });
        if (callbackError) throw callbackError;
        if (hasCallback && !restoredSession) throw Object.assign(new Error(), { code: 'callback_session_missing' });
        await enterSession(restoredSession);
    } catch (error) { showLogin(loginError(error), restoredSession, 'error'); }
    finally { if (hasCallback) clearCallbackParameters(); }
}

$('google-login').addEventListener('click', async () => {
    $('google-login').disabled = true;
    notice('login-status', '正在前往 Google 登入…');
    try {
        const { error } = await client.auth.signInWithOAuth({
            provider: 'google', options: { redirectTo: new URL('./', location.href).href, queryParams: { prompt: 'select_account' } },
        });
        if (error) throw error;
    } catch {
        notice('login-status', '目前無法登入，請稍後再試或聯絡管理員。', 'error');
        $('google-login').disabled = false;
    }
});

async function signout() {
    if (dirty && !confirm('編輯內容尚未儲存，確定要登出嗎？')) return;
    $('signout').disabled = $('login-signout').disabled = true;
    try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
        generation += 1; showLogin('你已安全登出。');
    } catch {
        notice(member ? 'dashboard-status' : 'login-status', '登出未完成，請確認連線後再試。', 'error');
    } finally { $('signout').disabled = $('login-signout').disabled = false; }
}
$('signout').addEventListener('click', signout);
$('login-signout').addEventListener('click', signout);

function selectPanel(id) {
    for (const tab of document.querySelectorAll('[data-panel]')) {
        const active = tab.dataset.panel === id;
        tab.classList.toggle('active', active);
        if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
        $(tab.dataset.panel).hidden = !active;
    }
}
for (const tab of document.querySelectorAll('[data-panel]')) tab.addEventListener('click', () => {
    if (tab.hidden) return;
    selectPanel(tab.dataset.panel);
    if (tab.dataset.panel === 'members-panel') loadMembers();
    if (tab.dataset.panel === 'audit-panel') loadAudit();
});

async function loadContent() {
    const current = generation;
    const allowed = ['announcement', 'document'].filter(kind => mayEdit(member, kind));
    $('content-list').setAttribute('aria-busy', 'true');
    $('refresh-content').disabled = true;
    try {
        const items = [];
        if (allowed.length) for (let offset = 0; ; offset += 200) {
            const { data, error } = await client.from('content').select('*').in('kind', allowed)
                .order('date', { ascending: false }).order('id').range(offset, offset + 199)
                .abortSignal(AbortSignal.timeout(12000));
            if (error) throw error;
            items.push(...data);
            if (data.length < 200) break;
        }
        if (current !== generation || !member) return;
        contents = items; renderContent();
    } catch (error) {
        notice('dashboard-status', displayError(error), 'error');
    } finally {
        $('content-list').setAttribute('aria-busy', 'false');
        $('refresh-content').disabled = false;
    }
}

function renderContent() {
    const query = $('content-search').value.trim().toLocaleLowerCase();
    const filtered = contents.filter(item => (!$('content-kind').value || item.kind === $('content-kind').value)
        && (!$('content-status').value || item.status === $('content-status').value)
        && (!query || `${item.title} ${item.category}`.toLocaleLowerCase().includes(query)));
    $('content-count').textContent = `顯示 ${filtered.length} 筆，共 ${contents.length} 筆可管理內容`;
    const nodes = filtered.map(item => {
        const row = element('article', undefined, 'content-row');
        const status = element('div');
        status.append(element('span', labels[item.status], `badge ${item.status}`));
        const body = element('div');
        body.append(element('p', `${labels[item.kind]} · ${item.category} · ${item.date}`, 'muted'), element('h3', item.title));
        const readonly = item.status === 'published' && !mayPublish(member);
        const button = element('button', readonly ? '檢視' : '編輯', 'button button-secondary');
        button.addEventListener('click', () => openEditor(item));
        row.append(status, body, button);
        return row;
    });
    $('content-list').replaceChildren(...(nodes.length ? nodes : [element('p', contents.length ? '沒有符合條件的內容。' : '目前沒有可管理內容。有編輯權限的幹部可以從「新增內容」開始。', 'empty-state')]));
}
for (const id of ['content-search', 'content-kind', 'content-status']) $(id).addEventListener('input', renderContent);
$('refresh-content').addEventListener('click', loadContent);
$('new-content').addEventListener('click', () => openEditor());

function updatePreview() {
    $('preview-title').textContent = field('title').value || '尚未填寫標題';
    $('preview-summary').textContent = field('summary').value;
    $('preview-body').textContent = field('body').value;
    $('preview-meta').textContent = `${categoryValue()} · ${field('date').value}`;
    const url = safeHttpsUrl(field('url').value);
    $('preview-link').hidden = !url;
    if (url) $('preview-link').href = url; else $('preview-link').removeAttribute('href');
    field('url').required = field('kind').value === 'document';
    const custom = field('category').value === '__custom__';
    $('custom-category-row').hidden = !custom;
    $('custom-category').required = custom;
    $('custom-category').disabled = !custom || $('save-content').hidden;
    $('activity-template').hidden = field('kind').value !== 'announcement' || $('save-content').hidden;
}

function openEditor(item = null) {
    if (!member) return;
    editing = item; dirty = false; saving = false; recoverableDraft = null;
    form.reset();
    const readonly = item && (!mayEdit(member, item.kind) || (item.status === 'published' && !mayPublish(member)));
    for (const control of form.elements) control.disabled = Boolean(readonly);
    $('close-editor').disabled = false;
    $('save-content').hidden = Boolean(readonly);
    field('kind').value = item?.kind || (mayEdit(member, 'announcement') ? 'announcement' : 'document');
    for (const option of field('kind').options) option.disabled = !mayEdit(member, option.value);
    for (const option of field('status').options) option.disabled = option.value === 'published' && !mayPublish(member);
    if (item) {
        for (const key of ['kind', 'title', 'summary', 'body', 'date', 'category', 'academic_year', 'url', 'status']) field(key).value = item[key] || '';
    } else {
        const now = new Date();
        field('date').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    }
    setCategories(field('kind').value, item?.category || categories[field('kind').value][0]);
    $('editor-heading').textContent = readonly ? '檢視內容' : item ? '編輯內容' : '新增內容';
    notice('editor-status', readonly ? '你目前可編輯草稿；修改或下架已發布內容，需要發布權限。' : '');
    recoverableDraft = readonly ? null : draftStore?.load(item?.id);
    $('draft-recovery').hidden = !recoverableDraft;
    if (recoverableDraft) {
        const permitted = mayEdit(member, recoverableDraft.values.kind);
        $('restore-draft').disabled = !permitted;
        $('draft-recovery-message').textContent = !permitted ? '找到本機暫存，但目前帳號沒有編輯這種類型的權限。'
            : item && recoverableDraft.version !== item.version ? '找到本機暫存，但後台已有較新版本。回復文字後，儲存時仍會檢查版本衝突。'
            : `找到 ${new Date(recoverableDraft.savedAt).toLocaleString('zh-TW')} 的本機暫存，可回復尚未儲存的文字。`;
    }
    notice('draft-status', readonly ? '' : '編輯中的文字會暫存在此瀏覽器，仍需按「儲存內容」存入後台。');
    updatePreview(); dialog.showModal();
}
field('kind').addEventListener('change', () => {
    const previous = categoryValue();
    const isPreset = Object.values(categories).flat().includes(previous);
    setCategories(field('kind').value, isPreset ? categories[field('kind').value][0] : previous);
});
form.addEventListener('input', () => { dirty = true; updatePreview(); saveLocalDraft(); });
form.addEventListener('change', () => { dirty = true; updatePreview(); saveLocalDraft(); });
$('restore-draft').addEventListener('click', () => {
    if (!recoverableDraft || !mayEdit(member, recoverableDraft.values.kind)) return;
    const draft = recoverableDraft;
    for (const [key, value] of Object.entries(draft.values)) if (key !== 'category') field(key).value = value;
    setCategories(draft.values.kind, draft.values.category);
    if (!mayPublish(member) && field('status').value === 'published') field('status').value = 'draft';
    if (editing) editing = { ...editing, version: draft.version };
    recoverableDraft = null; $('draft-recovery').hidden = true;
    dirty = true; updatePreview(); saveLocalDraft();
});
$('discard-draft').addEventListener('click', () => {
    if (!draftStore?.remove(editing?.id)) { notice('draft-status', '目前無法清除本機暫存，請確認瀏覽器儲存設定。', 'error'); return; }
    recoverableDraft = null; $('draft-recovery').hidden = true;
    notice('draft-status', '已捨棄本機暫存，後台內容未變更。');
});
$('activity-template').addEventListener('click', () => {
    if (field('body').value.trim() && !confirm('套用範本會替換目前內文，確定繼續嗎？')) return;
    setCategories('announcement', '校園活動');
    field('body').value = '活動時間：\n活動地點：\n參加對象：\n報名方式：\n注意事項：';
    dirty = true; updatePreview(); saveLocalDraft();
    notice('editor-status', '請填妥活動時間、地點與報名方式，再發布。活動頁會同步顯示「校園活動」類別的已發布公告。');
});
function closeEditor() {
    if (saving) return;
    if (dirty && !confirm('內容尚未儲存，確定要關閉嗎？')) return;
    dirty = false; dialog.close();
}
$('close-editor').addEventListener('click', closeEditor);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
window.addEventListener('beforeunload', event => { if (dirty) { saveLocalDraft(); event.preventDefault(); event.returnValue = ''; } });

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !member) return;
    let item;
    try {
        item = validateContent(editorValues());
        if (!mayEdit(member, item.kind) || (item.status === 'published' && !mayPublish(member))) throw new Error('你目前沒有編輯或發布這項內容的權限。');
    } catch (error) { notice('editor-status', error.message, 'error'); return; }
    if (item.status === 'published' && !confirm('儲存後，這份內容會立即公開在官網。確定發布嗎？')) return;
    const current = generation, localDraftStore = draftStore, draftId = editing?.id;
    const enabledControls = [...form.elements].filter(control => !control.disabled);
    saving = true;
    for (const control of enabledControls) control.disabled = true;
    notice('editor-status', '正在儲存…');
    try {
        let query = client.from('content');
        query = editing ? query.update(item).eq('id', editing.id).eq('version', editing.version) : query.insert(item);
        const { data, error } = await query.select('id').maybeSingle().abortSignal(AbortSignal.timeout(12000));
        if (error) throw error;
        if (!data) {
            if (current === generation) notice('editor-status', '內容可能已被其他人修改，或你的權限已變更。請保留目前文字，關閉後重新整理再編輯。', 'error');
            return;
        }
        localDraftStore?.remove(draftId);
        if (current !== generation) return;
        dirty = false; dialog.close();
        notice('dashboard-status', item.status === 'published' ? '已發布。官網重新載入後即可看見更新。' : item.status === 'archived' ? '已下架，這份內容不再公開。' : '草稿已儲存，尚未公開。', 'success');
        $('view-published').hidden = item.status !== 'published';
        if (item.status === 'published') {
            $('view-published').href = item.kind === 'document' ? item.url : `../announcement.html?id=${encodeURIComponent(data.id)}`;
            $('view-published').textContent = item.kind === 'document' ? '查看這份文件 ↗' : '查看這則公告 ↗';
        }
        await loadContent();
    } catch (error) { if (current === generation) notice('editor-status', displayError(error), 'error'); }
    finally {
        if (current === generation) {
            saving = false;
            for (const control of enabledControls) control.disabled = false;
            updatePreview();
        }
    }
});

async function loadMembers() {
    if (member?.role !== 'admin') return;
    const current = generation;
    try {
        const members = [];
        for (let offset = 0; ; offset += 200) {
            const { data, error } = await client.from('staff_members').select('*').order('email')
                .range(offset, offset + 199).abortSignal(AbortSignal.timeout(12000));
            if (error) throw error;
            members.push(...data);
            if (data.length < 200) break;
        }
        if (current !== generation || member?.role !== 'admin') return;
        $('member-list').replaceChildren(...members.map(item => {
            const row = element('article', undefined, 'member-row');
            row.append(element('strong', item.email), element('p', `${labels[item.role]} · ${item.active ? '啟用中' : '已停用'}`, 'muted'));
            const rights = item.role === 'admin' ? '全部管理權限' : [item.edit_announcements && '編輯公告', item.edit_documents && '編輯文件', item.can_publish && '發布與下架'].filter(Boolean).join('、') || '尚未授予編輯權限';
            row.append(element('p', rights, 'muted'));
            const button = element('button', '調整權限', 'button button-secondary');
            button.addEventListener('click', () => {
                memberForm.elements.email.value = item.email;
                memberForm.elements.email.readOnly = true;
                memberForm.elements.role.value = item.role;
                for (const name of ['edit_announcements', 'edit_documents', 'can_publish', 'active']) memberForm.elements[name].checked = item[name];
                $('member-form-title').textContent = '調整成員權限';
                notice('member-status', ''); memberForm.scrollIntoView({ block: 'center', behavior: 'instant' });
            });
            row.append(button); return row;
        }));
    } catch (error) { notice('dashboard-status', displayError(error), 'error'); }
}
function resetMember() {
    memberForm.reset(); memberForm.elements.email.readOnly = false;
    $('member-form-title').textContent = '新增授權帳號'; notice('member-status', '');
}
$('reset-member').addEventListener('click', resetMember);
memberForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (member?.role !== 'admin' || $('save-member').disabled) return;
    const values = memberForm.elements;
    const email = values.email.value.trim().toLowerCase();
    if (!confirm(`確定儲存 ${email} 的角色與權限嗎？變更會立即生效。`)) return;
    $('save-member').disabled = true; notice('member-status', '正在儲存授權…');
    try {
        const { error } = await client.rpc('manage_staff', {
            member_email: email, member_role: values.role.value,
            allow_announcements: values.edit_announcements.checked, allow_documents: values.edit_documents.checked,
            allow_publish: values.can_publish.checked, member_active: values.active.checked,
        }).abortSignal(AbortSignal.timeout(12000));
        if (error) throw error;
        notice('member-status', '授權已儲存。成員可使用此 Google 帳號登入，本站不會寄送邀請信。', 'success');
        if (email === member.email) {
            const { data, error: sessionError } = await client.auth.getSession();
            if (sessionError) throw sessionError;
            await enterSession(data.session);
        } else await loadMembers();
    } catch (error) { notice('member-status', displayError(error), 'error'); }
    finally { $('save-member').disabled = false; }
});

async function loadAudit() {
    if (member?.role !== 'admin') return;
    const current = generation;
    $('refresh-audit').disabled = true;
    try {
        const { data, error } = await client.from('audit_log').select('id,actor_email,entity,record_id,action,after_data,created_at')
            .order('id', { ascending: false }).limit(50).abortSignal(AbortSignal.timeout(12000));
        if (error) throw error;
        if (current !== generation || member?.role !== 'admin') return;
        const nodes = data.map(item => {
            const row = element('article', undefined, 'audit-row');
            const record = item.after_data?.title || item.after_data?.email || item.record_id;
            row.append(element('strong', `${item.action === 'INSERT' ? '新增' : '更新'}${item.entity === 'content' ? '內容' : '成員權限'} · ${record}`),
                element('p', item.actor_email, 'muted'), element('time', new Date(item.created_at).toLocaleString('zh-TW')));
            return row;
        });
        $('audit-list').replaceChildren(...(nodes.length ? nodes : [element('p', '目前尚無修改紀錄。', 'empty-state')]));
    } catch (error) { notice('dashboard-status', displayError(error), 'error'); }
    finally { $('refresh-audit').disabled = false; }
}
$('refresh-audit').addEventListener('click', loadAudit);
initialize();
