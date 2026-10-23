import { parseCsv, safeHttpsUrl, normalizeDate } from './lib/content.js';
import { usesSupabaseForContent, publishedContent } from './backend.js';
export { safeHttpsUrl, normalizeDate };
const dataUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEU3zPSLHP7riuOfJrG3jurKybYQRV3ecfPQfdUItMZvX-2H2oYyZUxJGQVCILoCL4IWDuPildQFAT/pub?gid=20260713&single=true&output=csv';

export async function fetchRows() {
    const response = await fetch(dataUrl, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseCsv(await response.text());
}

export async function fetchAnnouncements() {
    if (usesSupabaseForContent) return (await publishedContent('announcement')).map(item => ({
        ...item, date: normalizeDate(item.date), url: safeHttpsUrl(item.url),
    }));
    return (await fetchRows()).slice(1).filter(cols => (cols[9] || '').trim()).map(cols => ({
        title: cols[9].trim(), date: normalizeDate(cols[7]), category: (cols[8] || '學生會公告').trim(),
        summary: (cols[10] || '').trim(), url: safeHttpsUrl(cols[11]),
    }));
}

export async function fetchDocuments() {
    if (usesSupabaseForContent) return (await publishedContent('document')).map(item => ({
        ...item, date: normalizeDate(item.date)?.label, isoDate: item.date,
        timestamp: normalizeDate(item.date)?.timestamp, year: item.academic_year, description: item.summary,
        url: safeHttpsUrl(item.url),
    })).filter(item => item.url && item.timestamp !== undefined);
    return (await fetchRows()).slice(1).map(cols => {
        const date = normalizeDate(cols[0]), url = safeHttpsUrl(cols[5]);
        if (!url || !date || !(cols[3] || '').trim()) return null;
        return { date: date.label, isoDate: date.iso, timestamp: date.timestamp,
            year: (cols[1] || '').trim(), category: (cols[2] || '其他公開文件').trim(),
            title: cols[3].trim(), description: (cols[4] || '').trim(), url };
    }).filter(Boolean);
}
