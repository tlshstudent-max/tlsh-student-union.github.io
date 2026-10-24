import { departments, publication } from './publication.js';
import { urgentDeadline } from './urgent.js';

export function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index], next = text[index + 1];
        if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
        else if (char === '"') quoted = !quoted;
        else if (char === ',' && !quoted) { row.push(field); field = ''; }
        else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && next === '\n') index += 1;
            row.push(field);
            if (row.some(value => value.trim())) rows.push(row);
            row = []; field = '';
        } else field += char;
    }
    if (quoted) throw new Error('CSV 引號未結束');
    row.push(field);
    if (row.some(value => value.trim())) rows.push(row);
    return rows;
}

export function safeHttpsUrl(value) {
    try {
        const url = new URL((value || '').trim());
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
}

export function normalizeDate(value) {
    const parts = (value || '').trim().split(/[./-]/).map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) return null;
    let year, month, day;
    if (parts[0] >= 1900) [year, month, day] = parts;
    else if (parts[2] >= 1900) [month, day, year] = parts;
    else return null;
    const timestamp = Date.UTC(year, month - 1, day), date = new Date(timestamp);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { iso, label: iso.replaceAll('-', '.'), timestamp };
}

export function validateContent(input) {
    const item = {
        kind: input.kind,
        title: String(input.title || '').trim(),
        summary: String(input.summary || '').trim(),
        body: String(input.body || '').trim(),
        category: String(input.category || '').trim(),
        date: String(input.date || ''),
        academic_year: String(input.academic_year || '').trim(),
        url: String(input.url || '').trim(),
        status: input.status,
        ...publication(input),
        is_urgent: input.is_urgent === true,
        urgent_until: input.is_urgent === true ? urgentDeadline(input.urgent_until) : null,
    };
    if (!['announcement', 'document'].includes(item.kind)) throw new Error('請選擇內容類型。');
    if (!item.title || item.title.length > 160) throw new Error('標題必填，最多 160 字。');
    if (item.summary.length > 500 || item.body.length > 20000) throw new Error('摘要最多 500 字，內文最多 20,000 字。');
    if (!item.category || item.category.length > 60) throw new Error('類別必填，最多 60 字。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !normalizeDate(item.date)) throw new Error('請輸入有效日期。');
    if (item.academic_year.length > 20) throw new Error('學年度最多 20 字。');
    if (item.url.length > 2048 || (item.url && !safeHttpsUrl(item.url))) throw new Error('連結須為有效的 HTTPS 網址。');
    if (input.department !== undefined && !Object.hasOwn(departments, input.department)) throw new Error('請選擇有效的發布位置。');
    if (input.show_on_home !== undefined && typeof input.show_on_home !== 'boolean') throw new Error('請確認是否同時顯示於首頁。');
    if (item.kind === 'document' && !item.url && !item.body) throw new Error('公開文件請填寫文件連結，或直接輸入會議紀錄／文件內文。');
    if (!['draft', 'published', 'archived'].includes(item.status)) throw new Error('請選擇內容狀態。');
    if (input.is_urgent !== undefined && typeof input.is_urgent !== 'boolean') throw new Error('請確認緊急通告設定。');
    if (item.is_urgent && item.kind !== 'announcement') throw new Error('只有公告可以設為緊急通告。');
    if (item.is_urgent && !item.urgent_until) throw new Error('緊急通告請填寫有效的結束時間（台灣時間）。');
    if (item.is_urgent && item.status === 'published' && new Date(item.urgent_until).getTime() <= Date.now()) throw new Error('緊急通告的結束時間已過，請設定新的時間，或取消緊急通告。');
    item.url = item.url ? safeHttpsUrl(item.url) : null;
    return item;
}

export function mayEdit(member, kind) {
    return Boolean(member?.active && (member.role === 'admin' || (kind === 'announcement' ? member.edit_announcements : member.edit_documents)));
}

export function mayPublish(member) {
    return Boolean(member?.active && (member.role === 'admin' || member.can_publish));
}
