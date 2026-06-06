## 1. Shared schema 與 error code (packages/shared)

- [x] 1.1 新增 `packages/shared/src/schemas/audit.ts`：定義 `AUDIT_ACTIONS` 受控詞彙（`auth.login.success` / `auth.login.failure` / `auth.logout` / `employee.read.list` / `employee.read.detail` / `employee.create` / `employee.update` / `employee.reset_password` / `employee.delete.blocked` / `vehicle.read.list` / `vehicle.read.detail` / `vehicle.create` / `vehicle.update` / `vehicle.delete` / `dashboard.read` / `audit.read.list` / `audit.read.detail`）、`AUDIT_ACTION_CATEGORIES`（`auth` / `employee` / `vehicle` / `dashboard` / `audit`）、`AUDIT_OUTCOMES`（`SUCCESS` / `FAILURE`）。
- [x] 1.2 在 `audit.ts` 定義 `auditLogListQuerySchema`（`page`、`pageSize`：預設 20、上限 100；`search`、`action`（單值或類別前綴）、`outcome`：`SUCCESS`/`FAILURE`/`ALL` 預設 `ALL`、`from`/`to`：`z.coerce.date().optional()`）與推導 type（`AuditLogListQuery`、`AuditLogDTO`）。
- [x] 1.3 從 `packages/shared/src/index.ts` re-export `audit.ts` 的全部內容。
- [x] 1.4 在 `packages/shared/src/errors.ts` 的 `ApiErrorCode` union 加入 `AUDIT_LOG_NOT_FOUND`。

## 2. 資料模型與 migration (apps/api)

- [x] 2.1 在 `apps/api/prisma/schema.prisma` 新增 `enum AuditOutcome { SUCCESS FAILURE }` 與 `model AuditLog`（欄位：`id` uuid、`createdAt`、`actorId String?`、`actorUsername String?`、`actorRole Role?`、`action String`、`method String`、`path String`、`targetType String?`、`targetId String?`、`outcome AuditOutcome`、`statusCode Int`、`ip String?`、`userAgent String?`、`metadata Json?`），並對 `createdAt`、`actorId`、`action`、`outcome` 建索引。
- [x] 2.2 跑 `npm run db:migrate`（`prisma migrate dev --name add_audit_log`）產生 migration 並更新 Prisma client。
- [x] 2.3 在 `apps/api/src/test/setup.ts` 的 `resetDb()` truncate 清單中加入 `audit_log`（保留 `vehicle`、`employee` 既有清理）。

## 3. 稽核記錄核心 (apps/api)

- [x] 3.1 新增 `apps/api/src/services/audit-logger.ts`：route→action 對應表與 `deriveAction(method, path)`（比對不到退回 `${resource}.${method}`）、`record(entry)` 以 best-effort 寫入（try/catch 吞例外並 `console.error`）。
- [x] 3.2 新增 `apps/api/src/middleware/audit.ts`：`auditMiddleware` 於 `res.on("finish")` 蒐集 `method`/`path`/`statusCode`、actor（優先 `res.locals.auditActor` → `req.user` → null）、`ip`/`userAgent`，推導 `outcome`（status < 400 → SUCCESS），呼叫 `audit-logger.record`；`GET /api/health` 略過。
- [x] 3.3 在 `apps/api/src/app.ts` 註冊 `auditMiddleware`（位置：`cookieParser` 之後、`employeesMethodOverride` 之前，以便記錄 405 刪除嘗試）。
- [x] 3.4 在 `apps/api/src/routes/auth.ts` 的 login handler：成功時設 `res.locals.auditActor`（含 id/username/role）；失敗時設 `res.locals.auditUsername` 與 `res.locals.auditMeta = { reason }`（`INVALID_CREDENTIALS` / `ACCOUNT_INACTIVE` / `ACCOUNT_LOCKED`）。

## 4. 稽核查詢 API (apps/api)

- [x] 4.1 新增 `apps/api/src/services/audit-serializer.ts`：將 Prisma `AuditLog` 序列化為對外 `AuditLogDTO`。
- [x] 4.2 新增 `apps/api/src/routes/audit-logs.ts`：整段掛 `requireAuth, requireAdmin`；`GET /` 以 `auditLogListQuerySchema` 驗證、依 `search`/`action`(含類別前綴)/`outcome`/`from`/`to` 組 where、`orderBy createdAt desc`、回 `{ items, page, pageSize, total, totalPages }`。
- [x] 4.3 在 `audit-logs.ts` 加 `GET /:id`：找不到回 `404 AUDIT_LOG_NOT_FOUND`，存在回完整紀錄（含 `metadata`）。
- [x] 4.4 在 `apps/api/src/app.ts` 掛載 `audit-logs` router（`app.use("/api/audit-logs", auditLogsRouter)`）。
- [x] 4.5 新增 `apps/api/src/routes/audit-logs.test.ts`：驗證未登入 → 401、USER → 403；admin 預設分頁；`outcome=FAILURE` 篩選；`search`+`from`/`to` 篩選；`pageSize=999` → 400；`GET /:id` 存在 → 200、不存在 → 404 `AUDIT_LOG_NOT_FOUND`。

## 5. 記錄行為測試 (apps/api)

- [x] 5.1 新增測試：登入成功寫入 `auth.login.success`（含 actor）、登入失敗寫入 `auth.login.failure`（`actorId=null`、`metadata.reason`）、登出寫入 `auth.logout`。
- [x] 5.2 新增測試：`POST /api/employees` → `employee.create`、`PATCH /api/vehicles/:id` → `vehicle.update`（含 `targetId`）、`DELETE /api/employees/:id` → `employee.delete.blocked`（`statusCode=405`、`outcome=FAILURE`）。
- [x] 5.3 新增測試：`GET /api/vehicles` → `vehicle.read.list`、`GET /api/employees/:id` → `employee.read.detail`（含 `targetId`）；`GET /api/health` 不產生紀錄。
- [x] 5.4 新增測試：best-effort — 稽核寫入丟例外時（mock `audit-logger.record` reject），原請求仍回原本狀態碼與 body。

## 6. 前端稽核頁面 (apps/web)

- [x] 6.1 新增 `apps/web/src/pages/AuditLogs.tsx`：用 TanStack Query 取 `GET /api/audit-logs`，TanStack Table 呈現欄位（時間、操作者、動作、目標、結果、IP），shadcn/ui 樣式。
- [x] 6.2 加入篩選控制（關鍵字 `search`、動作類別 `action`、結果 `outcome`、日期區間 `from`/`to`）與分頁；query 參數型別取自 `@vms/shared` 的 `auditLogListQuerySchema`。
- [x] 6.3 在 `apps/web/src/App.tsx` 新增 `/audit-logs` route，並以 `<RequireAdmin>` 守護。
- [x] 6.4 在 `apps/web/src/components/AppShell` 導覽列加入 `/audit-logs` 入口，僅 `role = ADMIN` 顯示。
- [x] 6.5 新增 `apps/web/src/pages/AuditLogs.test.tsx`：驗證 admin 可見列表與篩選互動、USER 被 `<RequireAdmin>` 導離。

## 7. 收尾與驗證

- [x] 7.1 跑 `npm run lint` 與 `npm test`（API + Web）全綠。
- [x] 7.2 `npm run dev` 手動驗證：admin 可開 `/audit-logs` 並看到自己的登入與操作紀錄；USER 看不到入口也進不去。
- [x] 7.3 跑 `openspec verify --change add-audit-log`（或 `/opsx:verify`）確認實作與 artifacts 一致。
