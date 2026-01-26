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
*   **📊 管理員後台**：
    *   安全登入機制 (Email/Password)。
    *   即時儀表板：查看總簽署人數與今日新增。
    *   資料列表與篩選：可依班級過濾，並即時預覽簽名圖檔。

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
