import { createHash } from 'node:crypto';
import { parseCsv, normalizeDate, validateContent } from './content.js';

function stableId(item) {
    const hex = createHash('sha256').update(JSON.stringify([item.kind, item.title, item.date, item.url])).digest('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const quote = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

// Imports the same public CSV projection consumed by the legacy website.
// Private sheets, student feedback, and account records are never imported.
export function sheetToSql(csv) {
    const rows = parseCsv(csv).slice(1), items = [], warnings = [];
    rows.forEach((cols, index) => {
        const candidates = [];
        if ((cols[9] || '').trim()) candidates.push({
            kind:'announcement', title:cols[9], summary:cols[10], category:cols[8] || '學生會公告',
            date:normalizeDate(cols[7])?.iso, url:cols[11], status:'published',
        });
        if ((cols[3] || '').trim()) candidates.push({
            kind:'document', title:cols[3], summary:cols[4], category:cols[2] || '其他公開文件',
            date:normalizeDate(cols[0])?.iso, url:cols[5], academic_year:cols[1], status:'published',
        });
        for (const candidate of candidates) {
            try { items.push(validateContent(candidate)); }
            catch (error) { warnings.push(`第 ${index + 2} 列 ${candidate.kind === 'document' ? '文件' : '公告'}：${error.message}`); }
        }
    });
    const columns = ['kind','title','summary','body','category','department','show_on_home','date','academic_year','url','status'];
    const statements = items.map(item => `insert into public.content (id, ${columns.join(', ')}) values (${[stableId(item),...columns.map(key=>item[key])].map(quote).join(', ')}) on conflict (id) do nothing;`);
    return {
        count:items.length, warnings,
        sql:`-- Import of the existing public website CSV. Review before applying.\nbegin;\n${statements.join('\n')}\ncommit;\n`,
    };
}
