# 學生活動肖像使用授權同意書 - 線上簽名系統 (React + Firebase)

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

### 3. 建置正式版
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
- 線上入口：未在 GitHub repository metadata 設定

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
