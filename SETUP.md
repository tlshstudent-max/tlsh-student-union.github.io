# 幹部後台啟用與交接

## 目前狀態

官網仍可直接由 GitHub Pages 發布。`site-config.js` 預設留白時，公告及文件繼續讀取原有 Google Sheets 公開 CSV；後台會顯示尚未啟用，沒有模擬登入或預設密碼。

後台程式、資料庫遷移與自動測試已隨儲存庫提供。真正的 Google 登入、遠端資料寫入與正式站發布，必須在以下設定完成後驗證。

## 1. 建立學生會持有的 Supabase 專案

由學生會可長期交接的帳號建立專案，妥善保存專案管理權限及復原方式。Supabase 的方案額度、暫停機制與備份能力依所選方案而定，交接時一併確認。

在 SQL Editor 執行 `supabase/migrations/001_content_management.sql` **一次**。這會建立：

- `content`：公告、文件、草稿與發布狀態。
- `staff_members`：幹部授權名單，不含密碼。
- `audit_log`：內容及成員權限修改紀錄，只有啟用中的管理員可讀取。
- RLS 與權限函式：一般訪客只能讀取已發布內容；編輯者依類型及發布權限操作；成員授權僅能透過受保護的 `manage_staff` 函式修改。

SQL 遷移包含 transaction，失敗會回復整次操作。請保留錯誤訊息並修正原因，勿關閉 RLS 或放寬權限來跳過問題。

## 2. 啟用 Google 登入

1. 在 Google Cloud 建立 OAuth Web application，設定同意畫面、使用對象與正式發布狀態。測試模式須把使用的幹部帳號加入測試使用者。
2. 在 Supabase Authentication → Sign In / Providers 啟用 Google。依其顯示的 Callback URL，設定 Google 的 Authorized redirect URI（通常為 `https://你的專案.supabase.co/auth/v1/callback`）。Google client secret 只填入 Supabase 控制台，不要寫進 GitHub、網頁或聊天。
3. 在 Supabase Authentication 的 URL Configuration 設定 Site URL，並加入精確的允許回呼地址：
   - 正式站：`https://tlshstudent-max.github.io/tlsh-student-union.github.io/admin/`
   - 本機：`http://127.0.0.1:8000/admin/`
   - 如果用 `/workspace` 當伺服器根目錄，另加 `http://127.0.0.1:8000/tlsh-student-union.github.io/admin/`。
4. 本站使用 Supabase SDK 的 PKCE 登入流程。回呼需回到同一個瀏覽器及來源，不要在登入途中改用另一個網址。

Google 會處理登入身分；只有 `staff_members` 中啟用的帳號可以使用工作台。其他 Google 帳號即使完成登入，也無法取得後台資料或寫入權限。一般學生不需要登入。

## 3. 建立第一位管理員

由專案擁有者在 SQL Editor 執行以下範本，先替換成實際使用 Google 登入的電子郵件：

```sql
insert into public.staff_members
    (email, role, edit_announcements, edit_documents, can_publish, active)
values
    ('請替換成管理員的google信箱', 'admin', true, true, true, true);
```

電子郵件一律使用小寫。此步驟只建立授權，不會寄信或建立 Google 帳號。之後管理員可在後台的「成員與權限」授權其他 Google 帳號、分配編輯／發布權限或停用成員。正常後台操作不能停用或降級最後一位管理員。

## 4. 搬移原有公開內容

先下載**目前網站實際使用的公開 CSV**，避免把草稿或學生回饋放入公開資料：

```bash
curl --fail --location --max-time 30 \
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEU3zPSLHP7riuOfJrG3jurKybYQRV3ecfPQfdUItMZvX-2H2oYyZUxJGQVCILoCL4IWDuPildQFAT/pub?gid=20260713&single=true&output=csv' \
  --output /tmp/tlsh-public.csv
node scripts/import-sheet.js /tmp/tlsh-public.csv /tmp/tlsh-import.sql
```

檢閱產生的 SQL，再於 Supabase SQL Editor 執行。輸出檔已存在時工具會停止，避免覆寫。無效日期、缺少文件網址等資料會明確回報，整次轉換不會產生檔案；先修正資料再重跑。穩定 ID 可避免重跑相同匯入時新增重複項目；搬移後的編輯應統一在後台進行，這不是持續雙向同步工具。

先核對筆數、標題、日期及連結，確認資料齊全後，再切換網站設定。學生意見表單仍使用既有 Formspree，沒有把學生回饋搬進公開內容庫。

## 5. 連接官網

編輯 `site-config.js`，填入 Supabase 的 Project URL 與 **publishable key**（或舊版 anon key）。這兩項屬於瀏覽器公開設定，可以提交到 GitHub。程式會拒絕 secret key 與 service_role JWT；真正的安全限制由資料庫 RLS 執行。

```js
export const siteConfig = Object.freeze({
    supabaseUrl: 'https://你的專案.supabase.co',
    supabasePublishableKey: '你的公開publishable金鑰',
});
```

請勿放入 service_role、Supabase secret key、Google client secret 或資料庫密碼。若雲端開發環境採限制網路，需允許該專案的確切主機名稱；不要關閉 TLS 驗證。

**切換後，官網只讀取 Supabase 中已發布的內容**，不會在後端失敗時自動重新公開舊試算表內容，避免已下架公告再次出現。沒有設定 Supabase 時，原有試算表讀取方式持續可用。

## 6. 本機開發與驗證

需要 Node.js 22 以上、npm 及 Python 3。既有雲端任務已隔離，直接使用 checkout，無須額外建立 worktree。

```bash
npm ci
npm run build
npm test
npm run dev
```

`vendor/supabase.js` 是固定版本 SDK 的瀏覽器 bundle，已提交到儲存庫；GitHub Pages 不需要臨時下載 JavaScript CDN，也不需要額外建置才能展示網站。依賴更新時須重新執行 build，並一起提交 lockfile、bundle 與授權檔。

瀏覽器測試：

```bash
npx playwright install chromium
npm run test:browser
# 雲端環境已有 Chromium 時：
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

資料庫測試使用 PGlite 的 PostgreSQL 引擎執行真實 migration 與 RLS，模擬 Supabase 簽發後的 JWT claims；瀏覽器測試攔截服務回應，驗證操作流程。這些測試**不代表** Google OAuth、Supabase 正式專案或正式網站已通過整合測試。

## 7. 正式上線驗收

設定完成後，以真實帳號逐項確認：

- 訪客免登入可以讀到公開公告與文件，無法讀取草稿、授權名單及修改紀錄。
- 管理員可登入、新增草稿、預覽、發布、編輯、下架，官網重新整理後出現相應結果。
- 編輯者只能管理獲授權的內容；沒有發布權限時不能修改已發布內容或直接發布草稿。
- 新授權帳號能登入；停用帳號在原登入工作階段中也不能繼續寫入。
- 權限異動與內容更新出現在修改紀錄，最後一位管理員不能被停用或降級。
- Google 登入可以從正式站回到 `/admin/`，登出後重新整理不會顯示工作台。
- 使用 320px、390px 手機檢查導覽、表單與對話框。

通過後再將此變更發布至 GitHub Pages。此儲存庫的檢查 workflow 不會自動部署。交接時移交 Google OAuth 與 Supabase 專案的管理權限，新增下一屆管理員後，再停用離任幹部；並依學生會保存政策管理帳號、稽核紀錄與備份。
