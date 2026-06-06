## Why（動機）

VMS (車輛管理系統) 目前對「誰、在什麼時候、對哪一筆資料、做了什麼」沒有任何留存：登入成功／失敗、員工與車輛的新增／修改、敏感資料的查閱全都不可追溯。對一個由 admin 全權建立帳號、管理公司資產的內部系統而言，缺乏 audit trail (稽核軌跡) 會在發生「資料被誰改掉」「帳號被誰嘗試登入」這類爭議時無從查證。

本 change 為系統補上一個 **唯讀、僅供管理者查看** 的 audit log (稽核日誌)，記錄所有 API 操作（含登入相關事件、資料異動、以及敏感資料讀取），並提供 `/audit-logs` 管理頁面供 admin 檢視與篩選。

> **與既有 Non-goals 的關係**：repo 層級的 Non-goals 原將「稽核日誌資料表」列為不處理項目。本 change 為使用者明確需求，**刻意推翻該項決定**並將其落地；其餘 repo 層級 Non-goals（multi-tenant、SSO、保養／保險／油耗模組、生產部署、i18n、頭像上傳）維持不變。

## What Changes（變更內容）

- 新增 `AuditLog` 資料表與對應 Prisma migration：以 append-only (僅新增、不可改／刪) 方式記錄每一筆 `/api/*` 請求。
- 新增 **audit recording middleware (稽核記錄中介層)**：在每個請求 response 結束時，以 best-effort (盡力而為、失敗不阻斷主流程) 方式寫入一筆稽核紀錄；紀錄涵蓋：
  - 登入相關事件：登入成功、登入失敗、帳號鎖定、登出。
  - 資料異動：employee / vehicle 的新增、修改（含密碼重設）、以及被擋下的刪除嘗試 (POST / PATCH / DELETE)。
  - 敏感資料讀取：employee / vehicle / dashboard / audit-log 的列表與詳情查閱 (GET)。
- 新增 `GET /api/audit-logs`（列表，分頁＋篩選）與 `GET /api/audit-logs/:id`（單筆詳情），**僅限 ADMIN**。稽核紀錄不提供任何新增／修改／刪除 API。
- 新增前端 `/audit-logs` 頁面（admin-only，由 `<RequireAdmin>` 守護）：表格呈現時間、操作者、動作、目標、結果、來源 IP，支援關鍵字、動作類別、結果與日期區間篩選與分頁。
- 在 `@vms/shared` 新增 audit 相關 zod schema、推導 type、`AUDIT_ACTIONS` 受控詞彙，以及必要的 `ApiErrorCode`。

## Capabilities（能力）

### New Capabilities（新增能力）
- `audit-log`: 稽核日誌能力。涵蓋 `AuditLog` entity 結構、自動記錄行為（哪些事件被記錄、欄位來源、best-effort 語意）、admin-only 的列表／詳情查詢端點與篩選，以及前端 `/audit-logs` 檢視頁面。資料採永久保留，本 change 不含清理或保留期限機制。

### Modified Capabilities（修改能力）
<!-- 既有 auth / employees / vehicles / dashboard 端點的對外 contract (回應碼、body 結構) 不變；稽核記錄為橫切式 (cross-cutting) 新行為，完整定義於新的 audit-log capability，故此處留空。 -->
（無）

## Impact（影響範圍）

**新檔案／結構**
- `apps/api/src/middleware/audit.ts`：稽核記錄中介層（response finish hook）。
- `apps/api/src/services/audit-logger.ts`：寫入與 action 推導邏輯（route → action 對應表、best-effort 寫入）。
- `apps/api/src/routes/audit-logs.ts` + `audit-logs.test.ts`：唯讀查詢端點與測試。
- `apps/api/src/services/audit-serializer.ts`：對外輸出序列化。
- `apps/web/src/pages/AuditLogs.tsx` + `AuditLogs.test.tsx`：管理頁面與測試。
- `packages/shared/src/schemas/audit.ts`：query schema、type、`AUDIT_ACTIONS` 詞彙。
- `apps/api/prisma/migrations/<timestamp>_add_audit_log/`：新增資料表 migration。

**依賴新增**
- 無新增 npm 依賴（沿用既有 Express / Prisma / zod / TanStack 等）。

**新增環境變數**
- 無。

**資料庫 migration**
- 新增 `audit_log` 資料表，含索引：`createdAt`、`actorId`、`action`、`outcome`。

**API 路由前綴**
- 新增 `/api/audit-logs`（GET list、GET `/:id`）；於 `apps/api/src/app.ts` 註冊 audit middleware 與 router。

**前端路由**
- 新增 `/audit-logs`（admin-only）；於 `App.tsx` 與 `AppShell` 導覽列加入入口（僅 admin 可見）。

**測試覆蓋面**
- API：稽核 middleware 會在登入成功／失敗、employee/vehicle 異動、GET 讀取後各寫入一筆紀錄；`GET /api/audit-logs` 的 admin-only 授權（USER → 403、未登入 → 401）、分頁與篩選；best-effort（寫入失敗不影響主請求回應）。
- Web：`/audit-logs` 的 admin-only route guard、列表渲染與篩選互動。
