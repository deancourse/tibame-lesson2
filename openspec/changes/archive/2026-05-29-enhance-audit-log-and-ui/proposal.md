## Why（動機）

操作紀錄（audit log，稽核日誌）頁面上線後，管理者在實際查核時遇到數個痛點：篩選器一次只能選單一動作類別與單一結果、看不到請求實際帶了哪些參數、來源 IP（IP address，網路位址）以明碼完整顯示有隱私疑慮、且「動作」欄顯示的是 `auth.login.success` 這類原始字串而非人類可讀標籤。同時，整體介面也累積了三個明顯可用性問題：使用者身分在左下角側欄與右上角標頭重複顯示、車輛與員工編輯彈窗的日期欄位開啟時空白、左側選單（sidebar，側邊導覽）未固定且不滿版。本 change 一次處理這批 UX（user experience，使用者體驗）優化。

## What Changes（變更內容）

### A. 操作紀錄頁面優化
- **篩選器強化**：
  - 「使用者」維持文字搜尋，但 SHALL 支援多關鍵字（以逗號分隔，對 `actorUsername` 做 OR 模糊比對）。
  - 「動作」下拉由目前的「類別」層級（auth / employee / vehicle / dashboard / audit）改為「具體動作」**複選**（multi-select，可多選），選項顯示中文語意標籤。
  - 「結果」由單選改為**複選**（`SUCCESS` / `FAILURE`）。
- **新增「API 參數」呈現**：audit recording middleware（稽核記錄中介層）SHALL 擷取請求參數（route params、query、body），遮蔽敏感欄位後寫入 `metadata`；前端表格新增一欄，滑鼠移過時以 tooltip（提示框）顯示完整參數 JSON。
- **來源 IP 遮蔽**：前端 SHALL 將 IPv4 中間兩段遮成 `a.*.*.d`（非 IPv4 格式做合理 fallback）；欄位上方提供開關，預設為「遮蔽（開）」。原始 IP 仍完整保存在資料庫，僅前端顯示遮蔽。
- **動作欄語意化**：表格「動作」欄改顯示中文標籤，與動作複選下拉的選項文字一致。新增 `AUDIT_ACTION_LABELS`（action → 中文標籤對應）由 `@vms/shared` 匯出，前後端共用。

### B. UI／版面修正
- **使用者身分整合**：移除右上角標頭的「歡迎回來，{name}」，使用者姓名與角色僅在左下角側欄顯示一處；標頭保留主題切換與登出按鈕。
- **日期欄位回填修正**：車輛編輯彈窗「購買日期」（`purchasedAt`）與員工編輯彈窗「入職日期」（`hiredAt`）目前將 `Date` 物件傳給 `<input type="date">` 導致空白，SHALL 改以 `YYYY-MM-DD` 字串回填。
- **側欄固定滿版**：側欄 SHALL 固定為視窗 100% 高度且不隨主內容捲動，僅主內容區可捲動。

## Capabilities（能力）

### New Capabilities（新增能力）
- `web-shell`: 應用程式外殼（application shell）版面與全域導覽 — 側欄固定滿版佈局、使用者身分（identity）單一顯示位置與標頭組成。

### Modified Capabilities（修改能力）
- `audit-log`: 列表查詢篩選由單值擴充為多值（多關鍵字 search、具體動作多選、結果多選）；自動記錄需在 `metadata` 寫入遮蔽後的請求參數；前端頁面新增 API 參數欄（hover 顯示）、IP 遮蔽開關、動作中文標籤與複選篩選；新增動作語意化標籤詞彙。
- `vehicles`: 車輛前端頁面 — 編輯既有車輛時「購買日期」SHALL 正確回填原值。
- `employees`: 員工管理前端頁面 — 編輯既有員工時「入職日期」SHALL 正確回填原值。

## Non-goals（非目標）
- 本 change **不**新增 distinct actor（去重操作者）清單 API；使用者篩選採多關鍵字文字搜尋。
- 本 change **不**改變 IP 的儲存方式；遮蔽僅為前端顯示行為，資料庫仍保存完整 IP。
- 本 change **不**對既有稽核紀錄做 migration 或回填參數；`metadata` 參數僅對本 change 之後的新請求生效。
- 不處理 repo 層級既定非目標：multi-tenant、SSO／第三方登入、保養／保險／油耗模組、生產環境部署、i18n、頭像上傳。

## Impact（影響範圍）

- **前置依賴**：`audit-log` capability 之 baseline 來自尚未歸檔的 `add-audit-log` change（功能已於 commit a30c5ee 落地）。本 change 視其為前提；實作前 SHALL 先將 `add-audit-log` 歸檔（sync `audit-log` spec 至 `openspec/specs/`）以建立 baseline。詳見 design.md。

- **新檔案／結構**：
  - `apps/web/src/pages/AuditLogs.tsx` 之外可能新增前端共用元件：多選下拉（multi-select）、tooltip（若 `apps/web/src/components/ui/tooltip.tsx` 尚未存在則新增 shadcn tooltip）、IP 遮蔽工具函式。
  - `packages/shared/src/schemas/audit.ts` 新增 `AUDIT_ACTION_LABELS` 並由 `index.ts` 重新匯出。

- **後端（`@vms/api`）**：
  - `apps/api/src/middleware/audit.ts`：擷取並遮蔽請求參數寫入 `metadata`。
  - `apps/api/src/routes/audit-logs.ts`：查詢支援多值 `action`、多值 `outcome`、多關鍵字 `search`。
  - 不新增 API 路由（沿用前綴 `/api/audit-logs`）。

- **共用（`@vms/shared`）**：
  - `auditLogListQuerySchema` 擴充為支援陣列／多值（向下相容單值字串）。
  - 新增 `AUDIT_ACTION_LABELS`。

- **前端（`@vms/web`）**：
  - `apps/web/src/pages/AuditLogs.tsx`、`apps/web/src/components/AppShell.tsx`、`apps/web/src/pages/Vehicles.tsx`、`apps/web/src/pages/Employees.tsx`。
  - 不新增前端路由（沿用 `/audit-logs`）。

- **依賴新增**：無新增 npm 套件（多選與 tooltip 以 shadcn/既有元件實作）。
- **環境變數**：無新增。
- **資料庫 migration**：無（`metadata` 為既有 `Json?` 欄位，IP 遮蔽為前端行為）。

- **測試覆蓋面**：
  - API（jest + supertest）：多值 `action`／`outcome` 篩選、多關鍵字 `search`、middleware 寫入的 `metadata` 已遮蔽敏感欄位。
  - Web（Vitest + RTL）：動作中文標籤渲染、IP 遮蔽開關切換、複選篩選、車輛／員工編輯彈窗日期正確回填。
