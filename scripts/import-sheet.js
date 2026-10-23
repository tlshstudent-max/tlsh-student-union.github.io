import { readFile, writeFile } from 'node:fs/promises';
import { sheetToSql } from '../lib/sheet-import.js';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
    console.error('Usage: node scripts/import-sheet.js /tmp/public.csv /tmp/import-content.sql');
    process.exitCode = 1;
} else {
    try {
        const result = sheetToSql(await readFile(input, 'utf8'));
        if (result.warnings.length) {
            console.error(result.warnings.join('\n'));
            throw new Error('有資料無法轉換，未產生匯入檔。請先修正或另行保存這些資料。');
        }
        await writeFile(output, result.sql, {flag:'wx'});
        console.log(`已產生 ${result.count} 筆公開內容的 SQL。執行前請檢閱；不會自動寫入遠端資料庫。`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
