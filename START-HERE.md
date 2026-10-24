# 免費後台：第一次啟用

**已完成 002 的既有專案要新增緊急通告**：只需在 Supabase SQL Editor 執行 [003_urgent_notices.sql](supabase/migrations/003_urgent_notices.sql)，再部署新版；不要重跑初始化檔。功能沿用原有發布權限，不需新增服務或付費。詳見 [升級說明](SETUP.md#已有專案啟用緊急通告)。

先維持簡單架構：**現有 GitHub Pages 官網＋一個 Supabase Free 專案＋Google 幹部登入**。學生免登入，幹部只有管理員與編輯者兩種角色。管理員擁有全部權限，可授權及停用其他幹部；編輯者按公告、文件及發布權限分工。

**已完成初始化的既有專案**：新增部門發布位置與直接輸入會議紀錄功能時，先在 SQL Editor 執行 [002_publication_locations.sql](supabase/migrations/002_publication_locations.sql)，再部署新版介面。它保留原有內容與幹部，不要重跑初始化檔。日常發布位置及會議紀錄操作見 [CONTENT-GUIDE.md](CONTENT-GUIDE.md)。

目前已建立的專案是 `kcoqkxtormklcfxmfmdb`，程式已填入它的 Project URL 與 anon 公開金鑰。`publicDataSource: 'supabase'` 讓官網公告與文件讀取幹部後台的已發布內容，這項變更合併部署後才會在正式站生效。以下是這個專案的操作入口：

- [專案首頁](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb)。
- [SQL Editor](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb/sql/new)：新專案執行私人初始化檔；若已執行過，不要重跑。
- [API Keys](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb/settings/api-keys)：複製 publishable key，勿使用 secret / service_role key。
- [Google 登入供應商](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb/auth/providers)。
- [登入回呼設定](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb/auth/url-configuration)。

這些入口供專案擁有者操作。使用者已完成私人初始化 SQL，並於 2026 年 10 月 24 日確認正式站 Google 登入成功。同日公開 API 核對確認：原試算表的一則公開公告已完整搬移，匿名讀取幹部名單及修改紀錄皆被拒絕。不要重跑初始化。草稿、發布與下架的正式站操作仍待下方驗收。

這次目標為每月 NT$0。專案及組織都選 Free，不升級、不選付費加購。免費額度、閒置暫停及最新方案條件，以建立當下的官方畫面為準；若畫面要求付費，先停止該步驟。文件可使用既有 HTTPS 連結，或直接在後台輸入會議紀錄內文，不另建檔案上傳服務。

## 1. 建立一個免費專案

登入 [Supabase 控制台](https://supabase.com/dashboard)，建立組織及專案：

| 項目 | 建議設定 |
| --- | --- |
| Organization name | TLSH Student Union |
| Organization plan | Free |
| Project name | tlsh-student-union |
| Region | Singapore；以建立畫面提供的鄰近區域為準 |
| Database password | 使用產生器建立，保存在自己的密碼管理工具，不貼到聊天或 GitHub |

Supabase 控制台的登入帳號與官網幹部授權分開管理。第一位官網管理員會使用初始化檔中已確認的 Google 信箱，不會把 Supabase 所有使用者自動升級成管理員。

## 2. 執行一次初始化檔

在這個新專案開啟 **SQL Editor → New query**，貼入本次準備的私人初始化 SQL，執行一次。它會在同一筆交易中：

1. 建立內容、幹部授權、修改紀錄與資料庫權限規則。
2. 授權第一位管理員，包含成員管理、公告、文件及發布權限。
3. 搬入原有公開試算表中的公告及文件。

**此檔已包含 `001_content_management.sql`，不要先執行一次建表，再執行合併檔。** 如果已有這三張應用程式資料表，工具會停止，不覆蓋既有帳號或內容。已完成部分手動設定的專案，依 [詳細說明](SETUP.md) 接續缺少的步驟。

初始化檔含有管理員信箱，保存在儲存庫外，不要提交或上傳到公開 GitHub。它不含任何密碼或服務金鑰。

需要重新產生時，先依 SETUP.md 下載網站目前使用的公開 CSV，再於儲存庫執行：

```bash
node scripts/prepare-backend.js \
  --owner '已確認的Google信箱' \
  --csv /tmp/tlsh-public.csv \
  --output /tmp/tlsh-backend-setup.sql
```

工具不會連接或修改遠端專案；無效資料會回報並停止，既有輸出檔不會被覆寫。

## 3. 啟用 Google 幹部登入

依 [Google 登入設定](SETUP.md#2-啟用-google-登入) 建立 OAuth 設定，並在 Supabase 啟用 Google provider。

本次 Google Cloud 專案由學生會官方帳號持有，ID 為 `tlsh-student-union-auth-512506`。測試模式時，將管理員已確認的 Google 信箱加入測試使用者。專案擁有者不會自動取得官網幹部權限。

| 填寫位置 | 值 |
| --- | --- |
| Google 的 Authorized JavaScript origins | `https://tlshstudent-max.github.io` |
| Google 的 Authorized redirect URIs | `https://kcoqkxtormklcfxmfmdb.supabase.co/auth/v1/callback` |
| Supabase Authentication → URL Configuration → Site URL | `https://tlshstudent-max.github.io/tlsh-student-union.github.io/admin/` |
| Supabase 的 Redirect URLs | `https://tlshstudent-max.github.io/tlsh-student-union.github.io/admin/` |

兩種回呼地址用途不同：

- **Google OAuth 的 Authorized redirect URI**：填 Supabase 顯示的 Callback URL，通常是 `https://專案代號.supabase.co/auth/v1/callback`。
- **Supabase 的 Redirect URLs**：加入 `https://tlshstudent-max.github.io/tlsh-student-union.github.io/admin/`。

Google client secret 只填在 Supabase 控制台，不放進網站程式或聊天。

Client ID 與 Client Secret 是不同的值：用戶端 ID 通常以 `.apps.googleusercontent.com` 結尾；用戶端密碼通常以 `GOCSPX-` 開頭。兩者必須來自同一個 Google OAuth 用戶端。若紀錄出現 `invalid_client`、`The provided client secret is invalid`，請核對 Supabase 的 Client Secret 欄位是否誤貼了 Client ID，並使用 Google 複製按鈕取得有效密鑰。

### 選完 Google 帳號後又回到登入畫面

先到上方「登入回呼設定」，確認 **Site URL** 及 **Redirect URLs** 都是完整的 `https://tlshstudent-max.github.io/tlsh-student-union.github.io/admin/`，儲存後從官網登入按鈕重新開始。不要重開舊的回呼連結，也不要在登入途中切換瀏覽器、裝置或網站來源。

後台會顯示授權失敗、驗證過期或未能保留登入驗證的說明。這些錯誤與「帳號尚未獲授權」不同：後者代表已有 Google 登入狀態，但不在啟用的幹部名單，畫面會顯示目前登入信箱，可按「登出並更換帳號」。請使用初始化時授權的管理員帳號。

若需協助，只提供登入按鈕下方的說明文字，不要貼回呼網址、code、token 或 Google client secret。瀏覽器自動測試涵蓋回呼成功、驗證交換失敗及缺少本機驗證資料，但不能代替本人在正式站的 Google 登入測試。

## 4. 接上官網並驗證

本次專案已填入 Project URL 與舊版 anon 公開金鑰，並將 `publicDataSource` 設成 `'supabase'`。合併部署後，公開頁面統一顯示後台的已發布內容；新增公告及文件在幹部工作台操作，試算表保留為搬移前備份。設定為 `'sheets'` 是舊資料來源模式，不能用它確認後台發布的結果。

先新增一筆「草稿」並儲存，確認工作台顯示儲存成功。測試發布時，使用一則已確認可公開的正式內容，將狀態改為「已發布」並儲存，再重新整理官網核對結果。只有已發布內容會公開，日期不會延後發布時間。

最後使用第一位管理員的 Google 帳號登入 `/admin/`，確認：

- 可以授權其他幹部，並分配編輯與發布權限。
- 儲存草稿後，未登入的官網看不到草稿。
- 發布後，官網重新整理可以讀到更新；下架後不再公開。
- 停用的幹部無法繼續儲存，最後一位管理員無法被停用。

通過後，日常更新就從工作台操作。試算表保留為搬移前備份，不再需要從兩處重複輸入。
