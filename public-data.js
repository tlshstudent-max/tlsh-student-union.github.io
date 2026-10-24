import { parseCsv, safeHttpsUrl, normalizeDate } from './lib/content.js';
import { usesSupabaseForContent, publishedContent } from './backend.js';
import { publication } from './lib/publication.js';
export { safeHttpsUrl, normalizeDate };
const dataUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEU3zPSLHP7riuOfJrG3jurKybYQRV3ecfPQfdUItMZvX-2H2oYyZUxJGQVCILoCL4IWDuPildQFAT/pub?gid=20260713&single=true&output=csv';

export async function fetchRows() {
    const response = await fetch(dataUrl, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseCsv(await response.text());
}

async function publicEntries(kind, options = {}) {
    let items;
    if (usesSupabaseForContent) items = await publishedContent(kind, null, options);
    else items = (await fetchRows()).slice(1).flatMap(cols => {
        const records = [];
        if ((cols[9] || '').trim()) records.push({ kind:'announcement',title:cols[9].trim(),date:normalizeDate(cols[7])?.iso,
            category:(cols[8] || '學生會公告').trim(),summary:(cols[10] || '').trim(),body:'',url:safeHttpsUrl(cols[11]) });
        const date = normalizeDate(cols[0]), url = safeHttpsUrl(cols[5]);
        if (date && url && (cols[3] || '').trim()) records.push({ kind:'document',title:cols[3].trim(),date:date.iso,
            category:(cols[2] || '其他公開文件').trim(),summary:(cols[4] || '').trim(),body:'',url,academic_year:(cols[1] || '').trim() });
        return records;
    });
    return items.map(item => ({ ...item, ...publication(item),date:normalizeDate(item.date),url:safeHttpsUrl(item.url) }))
        .filter(item => (!kind || item.kind === kind) && (!options.department || item.department === options.department) && (!options.home || item.show_on_home));
}

export const fetchAnnouncements = () => publicEntries('announcement');
export const fetchHomeContent = () => publicEntries(null, { home:true });
export const fetchDepartmentContent = (department, kind) => publicEntries(kind, { department });

export async function fetchDocuments() {
    return (await publicEntries('document')).map(item => ({ ...item,date:item.date?.label,isoDate:item.date?.iso,
        timestamp:item.date?.timestamp,year:item.academic_year,description:item.summary }))
        .filter(item => (item.url || item.body?.trim()) && item.timestamp !== undefined);
}
