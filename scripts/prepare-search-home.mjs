// Prepare an independently reviewable hostname homepage; never publish or alter live settings.
import { readFile, writeFile, copyFile, mkdir, readdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { hostnameRoot, rootRepositoryName, searchHomeHtml, searchHomeSitemap } from '../lib/search-home.js';

const project = new URL('../', import.meta.url);
const output = process.argv[2] ? resolve(process.argv[2]) : await mkdtemp(join(tmpdir(), 'tlsh-search-home-'));
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error('Output folder must be empty; existing files were preserved.');
const home = await readFile(new URL('index.html', project), 'utf8');
const description = home.match(/<meta name="description" content="([^"]+)"/)?.[1];
if (!description) throw new Error('Missing project description');
const verification = [...home.matchAll(/<meta name="google-site-verification" content="([^"]+)"/g)].map(match => match[1]);
const sitemap = searchHomeSitemap(await readFile(new URL('sitemap.xml', project), 'utf8'));
await writeFile(join(output, 'index.html'), searchHomeHtml(description, verification));
await writeFile(join(output, 'sitemap.xml'), sitemap);
await writeFile(join(output, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${hostnameRoot}sitemap.xml\n`);
await writeFile(join(output, '.nojekyll'), '');
for (const [source, target] of [['favicon.png','favicon.png'],['apple-touch-icon.png','apple-touch-icon.png'],['og-image.png','og-image.png'],['assets/union-logo.jpg','union-logo.jpg']]) {
    await copyFile(new URL(source, project), join(output, target));
}
await writeFile(join(output, 'README.md'), `# 學生會根網址品牌首頁\n\n這些檔案要放在 **${rootRepositoryName}** 儲存庫的最外層，不是目前官網儲存庫的子資料夾。\n\n1. 用 tlshstudent-max 帳號建立名為 ${rootRepositoryName} 的公開儲存庫。\n2. 上傳這個資料夾內的檔案，讓 index.html 直接位於儲存庫最外層。\n3. Settings → Pages → Deploy from a branch → main → / (root) → Save。\n4. 等部署完成後，確認 ${hostnameRoot} 能看到會標與官方介紹，${hostnameRoot}favicon.png 能開啟圖片。\n5. Google Search Console 新增或選擇「網址前置字元」資源 ${hostnameRoot}，完成擁有權驗證後提交 ${hostnameRoot}sitemap.xml，並對根網址和原官網首頁使用「網址審查 → 請求建立索引」。\n\n原官網、幹部登入與 OAuth 回呼仍使用原網址，不需改動 Supabase 或 Google 登入設定。\n\n根頁已保留原官網公開的 Search Console 驗證標記；若 Console 要求不同標記，請依該資源提供的新標記更新 index.html。標記存在不等於已完成擁有權驗證。\n\n這些訊號讓 Google 能在主機根層級讀到網站名稱及 favicon，但 Google 仍自行決定顯示內容及抓取時間。這不是立即更新、指定排名或保證縮圖的服務。\n`);
console.log(`Prepared ${rootRepositoryName} files: ${output}`);
