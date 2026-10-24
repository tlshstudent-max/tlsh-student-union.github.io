# 搜尋與品牌維護

首頁與各部門的標題、說明、canonical、Open Graph／Twitter 分享資訊直接存在 HTML，搜尋器無須執行 JavaScript 就能讀取。首頁也提供 Organization／WebSite 結構化資料。不要在說明或結構化資料中填入未公告的活動、保證回覆時間或虛構評分。

## Google 搜尋結果

- 要改善目前搜尋結果中的主機名稱與小圈圈圖示，需要在 `https://tlshstudent-max.github.io/` 提供可抓取的品牌首頁，而不只是修改子目錄內的官網。已提供 `node scripts/prepare-search-home.mjs`：會產生獨立部署套件，包含正式會標、96px favicon、網站名稱結構化資料、官網介紹、robots 與 sitemap；執行後會印出套件資料夾位置，也可指定全新的空資料夾作為第二個參數。
- 將套件放入同一帳號的 **`tlshstudent-max.github.io`** 公開儲存庫最外層，再設定 Pages 從 `main` 的 `/ (root)` 發布。這是品牌與快速查詢入口，連到現在的官網，並不搬動官網或改變登入回呼。原專案只合併產生器程式，不會自動建立或發布根網址網站。若根網址已有其他網站，先協調根首頁品牌，勿覆蓋。
- 根網址部署後，選擇 Search Console 的「網址前置字元」資源 `https://tlshstudent-max.github.io/`，完成驗證並提交根網址的 `sitemap.xml`，對根首頁與目前官網首頁請求重新建立索引。GitHub Pages 使用者通常無法用 DNS 驗證 `github.io` 的「網域」資源。套件會保留原官網公開驗證標記；標記存在不代表新資源已經驗證。
- Google 可自行改寫標題、網站名稱與摘要。上線不代表搜尋結果會立即改變，也無法保證顯示縮圖。
- 首頁可見介紹與 meta description 都直接說明官網用途。部門導覽使用 `data-nosnippet`，讓這份導覽清單不成為 Google 的搜尋摘要；導覽連結仍可正常使用及被探索。這個設定需要 Google 重新抓取，且不保證採用指定描述。參考：[Google 摘要控制](https://developers.google.com/search/docs/appearance/snippet)。
- Google 的「網站名稱」以網域或子網域為單位，不支援本專案使用的 `/tlsh-student-union.github.io/` 子目錄。此處的品牌資料仍有助辨識頁面，但無法保證取代搜尋結果中的「GitHub Pages documentation」。參考：[Google 網站名稱說明](https://developers.google.com/search/docs/appearance/site-names)。
- 現有 GitHub Pages 地址可繼續免費使用；未來若已有學校提供的子網域，再評估綁定即可，無須為此購買服務。
- 搜尋結果左側小圖示（favicon）也以主機名稱為單位，不支援子目錄各自設定。網站瀏覽器分頁可用本專案自己的圖示，但 Google 搜尋不一定會使用。若要同時控制網站名稱與搜尋 favicon，可另行評估遷移到 GitHub Pages 主機根目錄，或使用學校提供的子網域；遷移會牽涉登入回呼與連結，不能只移檔案。參考：[Google favicon 指引](https://developers.google.com/search/docs/appearance/favicon-in-search)。
- 在已驗證的 Google Search Console 網址資源提交 `sitemap.xml`，並用「網址審查」對首頁提出重新索引。這項操作需由該 Search Console 資源的擁有者執行。
- 子目錄內的 `robots.txt` 不會成為整個 `tlshstudent-max.github.io` 主機的 robots 規則。公開頁面與後台另外使用 HTML robots meta；`noindex` 不取代後台的登入及資料庫權限控制。
- Sitemap 只列已存在的靜態公開頁，移除過時且無法持續維護的日期與優先級，避免假造更新時間。新增靜態頁時，請同步加入 sitemap。

## 公告與分享圖片

- 公告／文件確認為公開內容後，才會在瀏覽器更新專屬 canonical、說明與 Article 資料；無效或已下架的內容讀取後設為 `noindex`。初始 HTML 允許索引，避免 Google 因一開始看到 `noindex` 而跳過執行 JavaScript；讀取暫時失敗則提供重新載入，不發出永久移除訊號。
- 公告目前由瀏覽器讀取資料，不保證搜尋器或班群分享機器人執行 JavaScript。它們至少能取得 HTML 的網站共用分享圖與說明；每篇公告的完整靜態預覽需要之後加入公開內容的靜態產生流程，不能只靠更改瀏覽器 meta 保證達成。
- 正式會標原圖保存在 `assets/union-logo.jpg`，由學生會上傳的 JPEG 原檔更名而來，沒有重畫或變色。首頁使用原圖，導覽與登入頁使用縮小的同一會標；網站自行託管，不依賴 IG 圖片網址。
- 共用分享圖為 `og-image.png`（1200×630），以正式會標搭配網站名稱與用途排版。`favicon.png` 為 96×96，手機主畫面使用 180×180、192×192 與 512×512 圖示。這些是不同用途，上線後仍需要各平台重新抓取，Google 不保證出現右側縮圖。
- 更換原圖後，執行 `npm run build:brand` 重新產生圖示及分享圖（使用既有 Playwright，需要已安裝 Chromium；本機亦可指定 `CHROMIUM_PATH`）。程式只縮放原圖、裁成圓形圖示並輸出靜態分享排版，不生成或重畫會標內容；一般 `npm run build` 不依賴這個產圖步驟。分享圖片更新時同步調整 HTML 的圖片版本參數。

## 外觀

全站可切換黑金／白色版。預設保留黑金版，只在本機 `tlsh-appearance` 儲存外觀偏好，不影響登入狀態，也不額外建立追蹤服務。停用瀏覽器儲存時，當前頁面仍可切換。
