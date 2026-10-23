import { getClient, isConfigured } from '../backend.js';
import { validateContent, mayEdit, mayPublish, safeHttpsUrl } from '../lib/content.js';

const $ = id => document.getElementById(id);
const form = $('content-form'), memberForm = $('member-form'), dialog = $('content-dialog');
const labels = { announcement: '公告', document: '公開文件', draft: '草稿', published: '已發布', archived: '已下架', admin: '管理員', editor: '編輯者' };
let client, member, sessionUser, contents = [], editing = null, dirty = false, saving = false, generation = 0;

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
function displayError(error) {
    if (error?.code === '42501') return '目前帳號沒有這項操作權限。若權限剛有異動，請重新登入。';
    if (error?.code === '23514' && error.message?.includes('administrator')) return '必須保留至少一位啟用中的管理員。請先授權另一位管理員，再調整此帳號。';
    if (error?.code === '23514' || error?.code === '22023') return '資料格式不符，請檢查必填欄位與網址。';
    if (['42P01', 'PGRST202', 'PGRST205'].includes(error?.code)) return '管理系統尚未完成啟用，請聯絡學生會管理員。';
    return '操作未完成，請確認網路連線後再試。未儲存的內容仍保留在畫面中。';
}

function showLogin(message, hasSession = false) {
    member = null; contents = []; sessionUser = null;
    $('dashboard').hidden = true;
    $('login-panel').hidden = false;
    $('google-login').hidden = hasSession;
    $('google-login').disabled = !isConfigured;
    $('login-signout').hidden = !hasSession;
    if (dialog.open) { dirty = false; dialog.close(); }
    notice('login-status', message);
}

async function enterSession(session) {
    const current = ++generation;
    if (!session?.user?.email) { showLogin('只有已獲授權的幹部可以進入工作台。'); return; }
    try {
        const { data, error } = await client.from('staff_members').select('*')
            .eq('email', session.user.email.toLowerCase()).maybeSingle().abortSignal(AbortSignal.timeout(12000));
        if (current !== generation) return;
        if (error) throw error;
        if (!data?.active) { showLogin('這個帳號尚未獲授權，或已停用。請聯絡學生會管理員。', true); return; }
        member = data; sessionUser = session.user;
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
        await loadContent();
    } catch (error) {
        if (current === generation) showLogin(displayError(error), true);
    }
}

// Callbacks must not await Supabase operations while the SDK auth lock is held.
async function initialize() {
    if (!isConfigured) { showLogin('後台尚未啟用。公開網站可正常瀏覽，幹部登入將於設定完成後開放。'); return; }
    try {
        client = await getClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        await enterSession(data.session);
        client.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') { generation += 1; showLogin('你已安全登出。'); }
            else if (event === 'SIGNED_IN' && session?.user?.id !== sessionUser?.id) {
                setTimeout(() => enterSession(session), 0);
            }
        });
    } catch { showLogin('無法完成登入，請重新嘗試，或聯絡學生會管理員。', true); }
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
    $('preview-meta').textContent = `${field('category').value} · ${field('date').value}`;
    const url = safeHttpsUrl(field('url').value);
    $('preview-link').hidden = !url;
    if (url) $('preview-link').href = url; else $('preview-link').removeAttribute('href');
    field('url').required = field('kind').value === 'document';
}

function openEditor(item = null) {
    if (!member) return;
    editing = item; dirty = false; saving = false;
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
        field('category').value = field('kind').value === 'document' ? '會議紀錄' : '學生會公告';
    }
    $('editor-heading').textContent = readonly ? '檢視內容' : item ? '編輯內容' : '新增內容';
    notice('editor-status', readonly ? '你目前可編輯草稿；修改或下架已發布內容，需要發布權限。' : '');
    updatePreview(); dialog.showModal();
}
form.addEventListener('input', () => { dirty = true; updatePreview(); });
form.addEventListener('change', () => { dirty = true; updatePreview(); });
function closeEditor() {
    if (saving) return;
    if (dirty && !confirm('內容尚未儲存，確定要關閉嗎？')) return;
    dirty = false; dialog.close();
}
$('close-editor').addEventListener('click', closeEditor);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !member) return;
    let item;
    try {
        item = validateContent(Object.fromEntries(new FormData(form)));
        if (!mayEdit(member, item.kind) || (item.status === 'published' && !mayPublish(member))) throw new Error('你目前沒有編輯或發布這項內容的權限。');
    } catch (error) { notice('editor-status', error.message, 'error'); return; }
    if (item.status === 'published' && !confirm('儲存後，這份內容會立即公開在官網。確定發布嗎？')) return;
    saving = true; $('save-content').disabled = true; $('close-editor').disabled = true;
    notice('editor-status', '正在儲存…');
    try {
        let query = client.from('content');
        query = editing ? query.update(item).eq('id', editing.id).eq('version', editing.version) : query.insert(item);
        const { data, error } = await query.select('id').maybeSingle().abortSignal(AbortSignal.timeout(12000));
        if (error) throw error;
        if (!data) { notice('editor-status', '內容可能已被其他人修改，或你的權限已變更。請保留目前文字，關閉後重新整理再編輯。', 'error'); return; }
        dirty = false; dialog.close();
        notice('dashboard-status', item.status === 'published' ? '已發布。官網重新載入後即可看見更新。' : item.status === 'archived' ? '已下架，這份內容不再公開。' : '草稿已儲存，尚未公開。', 'success');
        await loadContent();
    } catch (error) { notice('editor-status', displayError(error), 'error'); }
    finally { saving = false; $('save-content').disabled = false; $('close-editor').disabled = false; }
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
