# 搜尋與品牌維護

首頁與各部門的標題、說明、canonical、Open Graph／Twitter 分享資訊直接存在 HTML，搜尋器無須執行 JavaScript 就能讀取。首頁也提供 Organization／WebSite 結構化資料。不要在說明或結構化資料中填入未公告的活動、保證回覆時間或虛構評分。

## Google 搜尋結果

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
- 共用分享圖為 `og-image.png`（1200×630）。正式學生會標誌應使用原始圖檔，勿以生成圖或手動重畫取代。搜尋結果小圖示、手機主畫面圖示與分享圖是不同用途，上線後仍需要各平台重新抓取。

## 外觀

全站可切換黑金／白色版。預設保留黑金版，只在本機 `tlsh-appearance` 儲存外觀偏好，不影響登入狀態，也不額外建立追蹤服務。停用瀏覽器儲存時，當前頁面仍可切換。
