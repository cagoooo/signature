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
