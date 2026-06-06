## ADDED Requirements

### Requirement: 稽核紀錄實體結構 (Audit Log Entity Schema)

系統 SHALL 儲存 audit log (稽核日誌) 並具備下列欄位：`id` (uuid)、`createdAt` (timestamp，紀錄寫入時間)、`actorId` (操作者 employee id，可為 null 表示匿名／登入失敗)、`actorUsername` (操作者帳號快照 (snapshot)，可為 null)、`actorRole` (操作者角色快照 `ADMIN` / `USER`，可為 null)、`action` (語意化動作字串，SHALL 為受控詞彙 (controlled vocabulary) `AUDIT_ACTIONS` 中之一)、`method` (HTTP method)、`path` (請求路徑)、`targetType` (目標資源類型，如 `employee` / `vehicle`，可為 null)、`targetId` (目標資源 id，來自 path param，可為 null)、`outcome` (enum：`SUCCESS` / `FAILURE`)、`statusCode` (HTTP 回應碼，integer)、`ip` (來源 IP，可為 null)、`userAgent` (User-Agent header，可為 null)、`metadata` (JSON，額外結構化資料，可為 null)。

`AUDIT_ACTIONS` SHALL 由 `@vms/shared` 匯出，前後端共用；`actorUsername` 與 `actorRole` 為寫入當下的快照，後續即使該 employee 被改名或調整角色，既有紀錄 SHALL NOT 隨之變動。

#### Scenario: 紀錄包含操作者快照 (Record captures actor snapshot)

- **WHEN** 一位已登入的 employee 觸發任一被記錄的操作
- **THEN** 寫入的稽核紀錄 SHALL 包含當下的 `actorId`、`actorUsername`、`actorRole`
- **AND** 之後修改該 employee 的 `username` 或 `role` SHALL NOT 改變該筆既有紀錄的快照值

#### Scenario: outcome 依 HTTP 狀態碼推導 (Outcome derived from status code)

- **WHEN** 寫入稽核紀錄時對應請求的 HTTP `statusCode` 為 `< 400`
- **THEN** `outcome` SHALL 為 `SUCCESS`
- **WHEN** 對應請求的 HTTP `statusCode` 為 `>= 400`
- **THEN** `outcome` SHALL 為 `FAILURE`

### Requirement: 自動記錄所有 API 請求 (Automatic Recording of API Requests)

系統 SHALL 透過 audit recording middleware (稽核記錄中介層)，在每個 `/api/*` 請求的 response 結束時寫入一筆稽核紀錄。`action`、`targetType`、`targetId` SHALL 由 HTTP method 與比對到的路由 (matched route) 推導。`GET /api/health` SHALL NOT 被記錄。

記錄行為 SHALL 為 best-effort (盡力而為)：寫入稽核紀錄失敗 SHALL NOT 改變或阻斷原請求的 HTTP 回應，且 SHALL 將錯誤輸出到 server log。稽核紀錄 SHALL 為 append-only (僅新增)：系統 SHALL NOT 提供任何修改或刪除既有稽核紀錄的 API。

#### Scenario: 每個 API 請求各寫入一筆紀錄 (One record per API request)

- **WHEN** 任一 `/api/*`（`/api/health` 除外）請求完成回應
- **THEN** 系統 SHALL 寫入恰好一筆稽核紀錄，且 `method`、`path`、`statusCode` SHALL 對應該請求

#### Scenario: health 檢查不被記錄 (Health check is not recorded)

- **WHEN** 呼叫 `GET /api/health`
- **THEN** 系統 SHALL NOT 寫入稽核紀錄

#### Scenario: 寫入失敗不影響主請求 (Audit write failure does not affect main request)

- **GIVEN** 稽核紀錄寫入因故失敗（例如 DB 寫入丟出例外）
- **WHEN** 一個原本會成功的請求被處理
- **THEN** 該請求 SHALL 仍回傳其原本的 HTTP 狀態碼與 body
- **AND** 錯誤 SHALL 被輸出到 server log

#### Scenario: 稽核紀錄不可被修改或刪除 (Audit records are immutable)

- **WHEN** 對 `/api/audit-logs` 發出 `POST`、`PATCH`、`PUT` 或 `DELETE` 請求
- **THEN** 系統 SHALL NOT 提供對應端點，response SHALL 為 HTTP 404，body SHALL 為 `{ error: { code: "NOT_FOUND", message } }`

### Requirement: 記錄登入相關事件 (Recording Authentication Events)

系統 SHALL 記錄登入相關事件。登入成功 SHALL 記為 `action = "auth.login.success"`、`outcome = SUCCESS`，並以登入成功的 employee 填入 `actorId` / `actorUsername` / `actorRole`。登入失敗 SHALL 記為 `action = "auth.login.failure"`、`outcome = FAILURE`，`actorId` SHALL 為 null，`actorUsername` SHALL 為請求所提交的帳號（若有），且 `metadata` SHALL 包含失敗原因 `reason`（對應 `INVALID_CREDENTIALS` / `ACCOUNT_INACTIVE` / `ACCOUNT_LOCKED` 之一）。登出 SHALL 記為 `action = "auth.logout"`。

#### Scenario: 登入成功被記錄 (Successful login is recorded)

- **WHEN** 一位 employee 以正確帳密呼叫 `POST /api/auth/login`
- **THEN** 系統 SHALL 寫入一筆 `action = "auth.login.success"`、`outcome = SUCCESS` 的紀錄
- **AND** `actorId`、`actorUsername`、`actorRole` SHALL 對應該 employee

#### Scenario: 登入失敗被記錄且不洩漏 actorId (Failed login is recorded without actorId)

- **WHEN** 一個 `POST /api/auth/login` 請求以錯誤密碼或不存在的帳號失敗
- **THEN** 系統 SHALL 寫入一筆 `action = "auth.login.failure"`、`outcome = FAILURE` 的紀錄
- **AND** `actorId` SHALL 為 null，`actorUsername` SHALL 為請求提交的帳號
- **AND** `metadata.reason` SHALL 標示失敗原因

#### Scenario: 帳號鎖定時的失敗原因 (Failure reason when account is locked)

- **GIVEN** 一個 employee 因連續登入失敗達門檻而被鎖定 (`lockedUntil` 未到期)
- **WHEN** 該帳號於鎖定期間再次嘗試登入
- **THEN** 系統 SHALL 寫入 `action = "auth.login.failure"` 的紀錄，且 `metadata.reason` SHALL 為 `ACCOUNT_LOCKED`

### Requirement: 記錄資料異動 (Recording Data Mutations)

系統 SHALL 記錄 employee 與 vehicle 的寫入操作 (POST / PATCH / DELETE)，`action` SHALL 為對應的語意化動作（例如 `employee.create`、`employee.update`、`employee.reset_password`、`vehicle.create`、`vehicle.update`、`vehicle.delete`），`targetType` SHALL 為資源類型，`targetId` SHALL 為 path 中的資源 id（建立操作可為 null）。被中介層擋下而回 405 的員工刪除嘗試 SHALL 記為 `action = "employee.delete.blocked"`、`outcome = FAILURE`。

#### Scenario: 建立員工被記錄 (Creating an employee is recorded)

- **WHEN** admin 成功呼叫 `POST /api/employees`
- **THEN** 系統 SHALL 寫入一筆 `action = "employee.create"`、`outcome = SUCCESS`、`targetType = "employee"` 的紀錄
- **AND** `actorId` SHALL 為該 admin

#### Scenario: 更新車輛被記錄並帶 targetId (Updating a vehicle records targetId)

- **WHEN** admin 成功呼叫 `PATCH /api/vehicles/:id`
- **THEN** 系統 SHALL 寫入一筆 `action = "vehicle.update"`、`targetType = "vehicle"`、`targetId = :id` 的紀錄

#### Scenario: 被擋下的刪除嘗試被記錄 (Blocked delete attempt is recorded)

- **WHEN** 任一使用者對 `DELETE /api/employees/:id` 發出請求（系統回 405）
- **THEN** 系統 SHALL 寫入一筆 `action = "employee.delete.blocked"`、`outcome = FAILURE`、`statusCode = 405` 的紀錄

### Requirement: 記錄敏感資料讀取 (Recording Sensitive Reads)

系統 SHALL 記錄對 employee、vehicle、dashboard 與 audit-log 資源的讀取 (GET)，`action` SHALL 為對應的讀取動作（例如 `employee.read.list`、`employee.read.detail`、`vehicle.read.list`、`vehicle.read.detail`、`dashboard.read`、`audit.read.list`、`audit.read.detail`）。

#### Scenario: 列表讀取被記錄 (List read is recorded)

- **WHEN** 一位已登入使用者呼叫 `GET /api/vehicles`
- **THEN** 系統 SHALL 寫入一筆 `action = "vehicle.read.list"`、`outcome = SUCCESS` 的紀錄

#### Scenario: 詳情讀取被記錄並帶 targetId (Detail read records targetId)

- **WHEN** admin 呼叫 `GET /api/employees/:id`
- **THEN** 系統 SHALL 寫入一筆 `action = "employee.read.detail"`、`targetType = "employee"`、`targetId = :id` 的紀錄

### Requirement: 稽核查詢 API 僅限 admin 存取 (Admin-Only Access to Audit Queries)

所有稽核查詢 endpoint (`/api/audit-logs*`) SHALL 要求請求者具有 `role = ADMIN`；非 admin 請求 SHALL 收到 HTTP 403；未登入請求 SHALL 收到 HTTP 401。

#### Scenario: 未登入請求 (Unauthenticated request)

- **WHEN** 對 `/api/audit-logs*` 的請求未帶有有效 auth cookie
- **THEN** response SHALL 為 HTTP 401，body SHALL 為 `{ error: { code: "UNAUTHENTICATED", message } }`

#### Scenario: user 嘗試查詢稽核紀錄 (User attempts to query audit logs)

- **WHEN** 一位 `role = USER` 的使用者呼叫 `GET /api/audit-logs`
- **THEN** response SHALL 為 HTTP 403，body SHALL 為 `{ error: { code: "FORBIDDEN", message } }`

### Requirement: 稽核紀錄列表查詢與篩選 (Audit Log List Query and Filtering)

`GET /api/audit-logs` SHALL 回傳分頁 (pagination) 結果，結構為 `{ items, page, pageSize, total, totalPages }`，預設 `pageSize = 20`、上限 `100`，預設依 `createdAt` 由新到舊排序。Query 參數 SHALL 由 `@vms/shared` 的 `auditLogListQuerySchema` 以 zod 驗證，並 SHALL 支援下列篩選：`search`（比對 `actorUsername`）、`action`（單一動作或動作前綴類別，如 `auth` / `employee` / `vehicle`）、`outcome`（`SUCCESS` / `FAILURE` / `ALL`，預設 `ALL`）、`from` 與 `to`（`createdAt` 日期區間）。非法的 query 參數 SHALL 回 `400 VALIDATION_ERROR`。

#### Scenario: 預設分頁查詢 (Default paginated query)

- **WHEN** admin 呼叫 `GET /api/audit-logs` 不帶任何參數
- **THEN** response SHALL 為 HTTP 200，body SHALL 為 `{ items, page: 1, pageSize: 20, total, totalPages }`，且 `items` SHALL 依 `createdAt` 由新到舊排序

#### Scenario: 依結果篩選 (Filter by outcome)

- **WHEN** admin 呼叫 `GET /api/audit-logs?outcome=FAILURE`
- **THEN** response SHALL 為 HTTP 200，且 `items` 中每一筆的 `outcome` SHALL 皆為 `FAILURE`

#### Scenario: 依操作者與日期區間篩選 (Filter by actor and date range)

- **WHEN** admin 呼叫 `GET /api/audit-logs?search=<username>&from=<date>&to=<date>`
- **THEN** response SHALL 為 HTTP 200，且 `items` SHALL 僅包含 `actorUsername` 比對成功且 `createdAt` 落在區間內的紀錄

#### Scenario: 非法分頁參數 (Invalid pagination parameter)

- **WHEN** admin 呼叫 `GET /api/audit-logs?pageSize=999`
- **THEN** response SHALL 為 HTTP 400，body SHALL 為 `{ error: { code: "VALIDATION_ERROR", message, details } }`

### Requirement: 稽核紀錄詳情查詢 (Audit Log Detail Query)

`GET /api/audit-logs/:id` SHALL 回傳單筆稽核紀錄的完整內容（含 `metadata`）。當 id 不存在時 SHALL 回 HTTP 404，body 為 `{ error: { code: "AUDIT_LOG_NOT_FOUND", message } }`。`AUDIT_LOG_NOT_FOUND` SHALL 先加入 `packages/shared/src/errors.ts` 的 `ApiErrorCode`。

#### Scenario: 取得存在的稽核紀錄 (Fetch existing record)

- **WHEN** admin 以存在的 id 呼叫 `GET /api/audit-logs/:id`
- **THEN** response SHALL 為 HTTP 200，body SHALL 為該筆紀錄的完整欄位（含 `metadata`）

#### Scenario: 取得不存在的稽核紀錄 (Fetch missing record)

- **WHEN** admin 以不存在的 id 呼叫 `GET /api/audit-logs/:id`
- **THEN** response SHALL 為 HTTP 404，body SHALL 為 `{ error: { code: "AUDIT_LOG_NOT_FOUND", message } }`

### Requirement: 前端稽核紀錄頁面 (Frontend Audit Log Page)

前端 SHALL 提供 `/audit-logs` 頁面，且 SHALL 由 `<RequireAdmin>` 守護：`role = USER` 的使用者導向此路由 SHALL 被導離 (redirect) 而無法看到內容。頁面 SHALL 以表格呈現稽核紀錄，欄位至少包含：時間 (`createdAt`)、操作者 (`actorUsername`)、動作 (`action`)、目標 (`targetType` / `targetId`)、結果 (`outcome`)、來源 IP (`ip`)，並 SHALL 提供關鍵字、動作類別、結果與日期區間篩選與分頁控制；導覽列的 `/audit-logs` 入口 SHALL 僅對 admin 顯示。

#### Scenario: admin 檢視稽核紀錄頁面 (Admin views audit log page)

- **WHEN** 一位 admin 開啟 `/audit-logs`
- **THEN** 頁面 SHALL 以表格呈現稽核紀錄，且 SHALL 提供篩選與分頁控制

#### Scenario: user 被擋於稽核紀錄頁面之外 (User is blocked from audit log page)

- **WHEN** 一位 `role = USER` 的使用者嘗試開啟 `/audit-logs`
- **THEN** 該使用者 SHALL 被導離且 SHALL NOT 看到稽核紀錄內容
- **AND** 導覽列 SHALL NOT 對該使用者顯示 `/audit-logs` 入口
