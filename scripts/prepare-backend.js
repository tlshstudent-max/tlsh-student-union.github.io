import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBackend } from '../lib/backend-setup.js';

try {
    const args = process.argv.slice(2), options = {};
    for (let index = 0; index < args.length; index += 2) {
        const name = args[index];
        if (!['--owner', '--csv', '--output'].includes(name) || !args[index + 1] || options[name]) {
            throw new Error('用法：node scripts/prepare-backend.js --owner 完整Google信箱 --csv /tmp/public.csv --output /tmp/backend-setup.sql');
        }
        options[name] = args[index + 1];
    }
    if (!options['--owner'] || !options['--csv'] || !options['--output']) {
        throw new Error('請提供 --owner、--csv 與 --output。初始化檔只能用於新的 Supabase 專案。');
    }
    const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
    const requested = resolve(options['--output']);
    const output = resolve(await realpath(dirname(requested)), basename(requested));
    const location = relative(root, output);
    if (!location || (!location.startsWith('..' + sep) && location !== '..' && !isAbsolute(location))) {
        throw new Error('初始化檔含有管理員信箱，請存到儲存庫外（例如 /tmp），避免隨網站公開。');
    }
    const [csv, migration] = await Promise.all([
        readFile(options['--csv'], 'utf8'),
        readFile(new URL('../supabase/migrations/001_content_management.sql', import.meta.url), 'utf8'),
    ]);
    const result = prepareBackend({email: options['--owner'], csv, migration});
    await writeFile(output, result.sql, {flag:'wx', mode:0o600});
    console.log(`已產生首次初始化檔，包含第一位全權管理員與 ${result.count} 筆公開內容。`);
    console.log('此檔尚未執行。請在預定的新 Supabase 專案 SQL Editor 中檢閱並執行一次。');
    console.log('不要先執行 001 migration；此檔已包含建表步驟。不要把此檔提交或上傳到公開儲存庫。');
} catch (error) {
    console.error(error.code === 'EEXIST' ? '輸出檔已存在，未覆寫。請保留原檔，或另選新的輸出檔名。' : error.message);
    process.exitCode = 1;
}
