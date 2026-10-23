# 免費後台：第一次啟用

先維持簡單架構：**現有 GitHub Pages 官網＋一個 Supabase Free 專案＋Google 幹部登入**。學生免登入，幹部只有管理員與編輯者兩種角色。管理員擁有全部權限，可授權及停用其他幹部；編輯者按公告、文件及發布權限分工。

目前已建立的專案是 `kcoqkxtormklcfxmfmdb`，程式已填入它的 Project URL 與 anon 公開金鑰。公開資料目前仍設定為 `publicDataSource: 'sheets'`，待建表、管理員授權及內容搬移驗證後，再切換成 `'supabase'`。以下是這個專案的操作入口：

- [專案首頁](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb)。
- [SQL Editor](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb/sql/new)：新專案執行私人初始化檔；若已執行過，不要重跑。
- [API Keys](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb/settings/api-keys)：複製 publishable key，勿使用 secret / service_role key。
- [Google 登入供應商](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb/auth/providers)。
- [登入回呼設定](https://supabase.com/dashboard/project/kcoqkxtormklcfxmfmdb/auth/url-configuration)。

這些入口供專案擁有者操作。使用者已完成私人初始化 SQL，2026 年 10 月 23 日的後續 API 檢查確認：已發布內容可讀（一則公告）、未公開內容查詢為空、匿名讀取幹部名單及修改紀錄皆被拒絕。不要重跑初始化。Google provider 仍未啟用；管理員登入及發布操作還要在 OAuth 設定完成後實測。

這次目標為每月 NT$0。專案及組織都選 Free，不升級、不選付費加購。免費額度、閒置暫停及最新方案條件，以建立當下的官方畫面為準；若畫面要求付費，先停止該步驟。文件繼續使用既有的 HTTPS 連結，第一版不另建檔案上傳服務。

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

本次專案可直接使用以下資料：

| 填寫位置 | 值 |
| --- | --- |
| Google Cloud OAuth 專案名稱（建議） | tlsh-student-union-auth |
| OAuth 用戶端類型 | Web application／網頁應用程式 |
| Google 的 Authorized JavaScript origins | `https://tlshstudent-max.github.io` |
| Google 的 Authorized redirect URIs | `https://kcoqkxtormklcfxmfmdb.supabase.co/auth/v1/callback` |
| Supabase Authentication → URL Configuration → Site URL | `https://tlshstudent-max.github.io/tlsh-student-union.github.io/admin/` |
| Supabase 的 Redirect URLs | `https://tlshstudent-max.github.io/tlsh-student-union.github.io/admin/` |

以第一位管理員的 Google 帳號操作 [Google Cloud 建立專案](https://console.cloud.google.com/projectcreate)。這裡只需要 OAuth 設定，不啟用付費運算服務或計費方案。專案建立後，在 Google Auth Platform 設定應用程式名稱、聯絡信箱與 External 使用對象。測試模式時，將管理員已確認的 Google 信箱加入測試使用者。

建立 Web application 用戶端並填入上表的 Google 網址後，將 Google 產生的 **Client ID** 及 **Client secret** 填入 Supabase 的 Google provider，啟用並儲存。Client secret 只填入 Supabase 控制台，勿傳到聊天或提交到 GitHub。

兩種回呼地址用途不同：

- **Google OAuth 的 Authorized redirect URI**：填 Supabase 顯示的 Callback URL，通常是 `https://專案代號.supabase.co/auth/v1/callback`。
- **Supabase 的 Redirect URLs**：加入 `https://tlshstudent-max.github.io/tlsh-student-union.github.io/admin/`。

Google client secret 只填在 Supabase 控制台，不放進網站程式或聊天。

## 4. 接上官網並驗證

本次專案已填入 Project URL 與舊版 anon 公開金鑰。先核對資料已搬移完整、權限及幹部登入正確，再將 `site-config.js` 的 `publicDataSource` 改成 `'supabase'` 並發布網站。切換後就統一使用後台內容；設定為 `'sheets'` 時，公開頁面仍顯示原有試算表，供設定期間維持服務。

最後使用第一位管理員的 Google 帳號登入 `/admin/`，確認：

- 可以授權其他幹部，並分配編輯與發布權限。
- 儲存草稿後，未登入的官網看不到草稿。
- 發布後，官網重新整理可以讀到更新；下架後不再公開。
- 停用的幹部無法繼續儲存，最後一位管理員無法被停用。

通過後，日常更新就從工作台操作。試算表保留為搬移前備份，不再需要從兩處重複輸入。
