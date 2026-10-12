# 學生活動肖像使用授權同意書 - 線上簽名系統 (React + Firebase)

🌐 **線上使用：[學生肖像使用授權同意書線上簽名](https://cagoooo.github.io/signature/)**

> 📌 **目前版本：v2.4.0**（依據 `package.json`）

這是一個現代化的線上簽名系統，專為學校設計，讓家長能透過手機或電腦輕鬆完成電子簽名。系統採用 React 前端搭配 Firebase 後端，提供高效、安全且響應式的使用體驗。

## ✨ 功能特色

*   **📱 RWD 響應式設計**：完美支援手機、平板與電腦，自動適應螢幕大小。
*   **✍️ 流暢簽名體驗**：整合 `react-signature-canvas`，提供接近紙筆的書寫手感。
*   **🛡️ 嚴格資料驗證**：
    *   限制年級、班級、座號僅能輸入數字。
    *   簽名筆畫複雜度檢查，防止無效簽名。
*   **🔒 安全性強化**：
    *   Firebase Security Rules 嚴格把關。
    *   簽名圖檔自動壓縮並標準化 (600x300)，節省流量。
*   **📊 管理員後台 2.0 (v2.0.0)**：
    *   **🎨 繽紛視覺設計**：全新漸層風格與動態背景，操作更愉悅。
    *   **📱 手機版卡片模式**：手機瀏覽時自動切換為卡片視圖，資訊一目瞭然。
    *   **🗑️ 批次管理功能**：支援單筆刪除與多選批次刪除，維護更輕鬆。
    *   **📥 Excel 匯出**：一鍵匯出完整簽署名單，方便學校行政作業。
    *   **📦 班級資料一鍵打包**：依目前搜尋、縣市、學校、年級與班級篩選結果，打包各班家長同意、不同意及意願未記錄的詳細清單。
    *   **🏷️ 視覺化徽章**：年級、班級、座號採用徽章樣式，提升閱讀效率。
    *   **🏫 跨校支援 (v2.1.0)**：
        *   新增 **縣市/學校** 欄位，支援多校使用。
        *   後台新增 **縣市篩選** 與 **學校搜尋** 功能。
    *   **📄 PDF 自動生成 (v2.2.0)**：
        *   簽署完成後，系統自動生成包含完整條款與簽名的 PDF 文件。
        *   PDF 文件自動上傳至 Firebase Storage 永久保存。
    *   **📧 Email 通知升級 (v2.2.0)**：
        *   通知信件包含 PDF 下載連結。
        *   信件內容新增縣市與學校資訊。
*   **✅ 簽署意願選項 (v2.3.0)**：
        *   新增「同意/不同意」單選按鈕，強制家長確認意願。
        *   PDF 與 Email 同步顯示簽署意願 (同意為綠色，不同意為紅色)。
        *   後台列表新增「意願」欄位，並支援 Excel 匯出。
*   **🔔 Google Chat 即時通知 (v2.4.0)**：
        *   Firestore 成功建立簽名資料後，由 Cloud Function 推送成功卡片。
        *   PDF、簽名圖檔、Firestore 或 Email 階段失敗時，前端回報失敗階段與進度。
        *   Webhook 僅存於 Firebase Secret Manager，不會放進 GitHub Pages 前端。

## 🚀 安裝與執行

### 1. 安裝依賴
```bash
npm install
```

### 2. 啟動本地開發伺服器
```bash
npm run dev
```
啟動後請訪問 `http://localhost:5173`。

### 3. 設定 Google Chat 通知

本專案的通知後端位於 `functions/`，部署區域為 `asia-east1`。請先在 Google Chat 的通知空間建立 incoming webhook，再把 webhook 存入 Firebase Secret Manager；不要把網址寫進 `.ts`、`.js` 或 `.env` 後提交到公開 repository。

```bash
firebase functions:secrets:set GOOGLE_CHAT_WEBHOOK --project face-2fa85 --account=cagooo@gmail.com --data-file=<含 webhook 的本機檔案>
firebase deploy --only functions --force --project face-2fa85 --account=cagooo@gmail.com
```

部署後，`onSignatureCreated` 會在 `signatures/{id}` 成功建立時通知；前端的 `reportSignatureFailure` 會回報目前失敗階段、進度、錯誤訊息，以及資料是否已先保存。前端 GitHub Pages 發布仍使用：

```bash
npm run build
npm run deploy
```

### 完整發布與正式站查核

完成原始碼的 commit 與 push 後，使用以下指令接續正式發布及驗證：

```bash
npm run release
```

這會沿用現有流程重新建置、發布至 `gh-pages`，再等待對應的 GitHub Pages 建置成功。查核會比對正式 `version.json`、首頁實際載入的主程式及其 SHA-256，確認線上檔案與本次 `dist` 一致，並確認班級打包功能已包含在正式主程式中；任何一項未通過會回傳失敗，避免把單純推送成功當成上線完成。

若只需重新查核既有發布，可執行 `npm run verify:release`。查核只有讀取公開靜態檔案及 GitHub 建置狀態，不會登入後台或讀取學生資料；登入後操作、實際家長通知及實體手機測試須分別確認。

### 4. 建置正式版
```bash
npm run build
```

## 🛠️ 技術架構

*   **前端框架**：React 19 + TypeScript + Vite
*   **樣式庫**：Tailwind CSS 4 + Framer Motion (動畫)
*   **後端服務**：Firebase (Firestore, Storage, Authentication)
*   **路由管理**：React Router v7

## 📂 專案結構

*   `/src/components`: UI 元件 (簽名表單、登入頁、儀表板)
*   `/src/firebase.ts`: Firebase 初始化設定
*   `firestore.rules`: 資料庫安全規則
*   `storage.rules`: 檔案儲存安全規則

## ⚙️ 管理後台設定

1.  前往 Firebase Console -> Authentication。
2.  啟用 **Email/Password** 登入方式。
3.  手動新增一個管理員使用者。
4.  在應用程式中訪問 `/admin/login` 即可登入。

### 班級資料一鍵打包

在後台先設定篩選條件，再點選「一鍵打包各班名單」，即可下載 ZIP。打包範圍是目前篩選後的全部簽署紀錄，不受單筆或多筆勾選狀態限制；沒有符合資料時不會產生空的資料包。

- 根目錄的 `班級總覽.xlsx` 包含各班簽署筆數、全部明細與匯出說明，並記錄篩選條件及臺灣時間的產生時間。
- 各班按「縣市／學校／年級班級」分資料夾，內含 `班級簽署明細.xlsx`；每本有「全部明細」「同意」「不同意」「意願未記錄」「待確認歸類」工作表，即使某類沒有紀錄仍保留欄位表頭。
- 明細包含學生姓名、年級、班級、座號、家長姓名、Email、意願、臺灣時間的簽署時間、簽名與 PDF 原始連結及紀錄 ID；班內按座號數字排序，`01` 與 `1` 等數字格式會統一整理。
- 依家長填寫的意願分為「同意」「不同意」；缺漏或無法辨識的舊資料列為「意願未記錄」。無效或缺漏的簽署時間顯示「未記錄」。
- 所有數量都是**簽署筆數**，不代表學生人數。同一學生的重複簽署全部保留，可用紀錄 ID 與簽署時間核對；系統沒有完整班級名冊，不能用這份清單判定誰尚未簽署。
- 資料包提供簽名圖檔與 PDF 連結，沒有下載實體檔案；產生資料包不會修改已儲存的簽署紀錄。請妥善保管含學生與家長個人資料的下載檔案。

### 自動整理學校與班級寫法

後台畫面、篩選、一般 Excel 匯出與班級打包使用同一套歸類規則。例如，桃園市的「石門國小」「龍潭區石門國小」「桃園市龍潭區石門國民小學」歸入同一學校；年級為 1 時，班級的「4」「04」「四班」「1年4班」歸入 1年4班。全形數字及明確的文字班名也會整理，同時保留原填欄位。

不同縣市的同名學校會保持分開。年級與完整年班寫法矛盾、缺少辨識資訊或數字格式有歧義時，保留原值並標示「歸類待確認」；匯出檔另有「待確認歸類」工作表及分組，不以相似字猜測學校，也不把 `104` 自行拆成 1年4班。

明細新增原始縣市、學校、年級、班級、座號與歸類說明，方便核對。整理只發生在畫面與下載結果，不會改寫家長原本送出的簽署資料。

已下載的資料包亦可在本機重新整理其 `班級總覽.xlsx`：

```powershell
node scripts/regroup-downloaded-consents.mjs --input="C:\資料包\班級總覽.xlsx" --output="C:\資料包\重新歸類.zip"
```

此指令不連線，保留來源檔案；輸出前會核對紀錄、原始欄位、個人資料、簽署時間與意願是否完整一致，並要求輸出到新的 ZIP 檔案。

---
Designed with ❤️ for Education.

---

<!-- BEGIN:PROJECT_GUIDE -->
## 專案導覽

學生活動肖像使用授權同意書

- 專案定位：校務／行政流程數位化專案
- Repository：`cagoooo/signature`
- 可見性：公開
- 主要技術：TypeScript、React、Vite、Firebase、Tailwind CSS
- 線上入口：<https://cagoooo.github.io/signature/>

### 可以怎麼應用

- 把紙本、試算表或人工通知流程轉成可追蹤的線上作業
- 依不同學校的欄位、角色與簽核方式進行客製化
- 作為校務系統、資料同步或自動通知整合的參考實作

這些是依目前專案定位整理的延伸方向，不代表所有情境都已內建完成；實作前請先確認現有功能與資料格式。

### 技術與專案結構

- `README.md`
- `firebase.json`
- `index.html`
- `package.json`
- `public`
- `src`
- `vite.config.ts`

檔案結構會隨版本演進；若本節與程式碼不一致，以目前預設分支的原始碼為準。

### 本機執行

```bash
npm install
# dev
npm run dev
# build
npm run build
# lint
npm run lint
```
請以 `package.json` 的 `scripts` 為準；若專案需要雲端服務，請先建立自己的環境變數與測試專案。

### 給 AI Agent 的接手指南

1. 先閱讀本 README、`AGENTS.md`（若有）、套件腳本與部署設定。
2. 先畫出角色、資料流、權限與外部服務，再修改表單或資料結構。
3. 不得提交學生個資、憑證、API 金鑰或正式環境匯出資料。
4. 涉及 schema、驗證、權限或通知時，同步檢查前後端與部署設定。
5. 不要捏造尚未存在的功能；README 與實作有落差時，應同時更新文件。
6. 提交前只納入本次任務檔案，並記錄實際執行過的驗證。

### 安全與資料注意事項

- 不要提交 `.env`、服務帳號、API 金鑰、token、學生個資或正式環境匯出資料。
- 使用 Firebase、Supabase、Google API 或其他雲端服務時，請建立自己的測試專案並套用最小權限。
- 若要公開衍生作品，請先確認程式碼、圖片、音訊、字型與教材內容的授權。

### 貢獻與客製化

歡迎依教學現場、活動或工作流程需求進行 fork／客製化。建議在變更說明中交代使用情境、主要修改、測試方式，以及是否影響資料格式或部署設定。
<!-- END:PROJECT_GUIDE -->
