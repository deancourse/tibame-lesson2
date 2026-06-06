# audit-log Specification

## Purpose

本 capability 定義系統的「稽核紀錄 (audit log)」：包含 audit log entity 結構與操作者快照 (snapshot)、透過 audit recording middleware 自動記錄所有 `/api/*` 請求（含登入相關事件、資料異動、敏感資料讀取）、append-only (僅新增) 且 best-effort (盡力而為) 的寫入語意、僅限 admin 存取的稽核查詢 API（列表查詢／篩選與詳情查詢），以及由 `<RequireAdmin>` 守護的前端 `/audit-logs` 頁面。

## Requirements

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

### Requirement: 動作語意化標籤 (Audit Action Semantic Labels)

`@vms/shared` SHALL 匯出 `AUDIT_ACTION_LABELS`，為 `AUDIT_ACTIONS` 中每一個動作提供對應的繁體中文標籤（label）。`AUDIT_ACTION_LABELS` SHALL 與 `AUDIT_ACTIONS` 同源維護，前後端共用；前端的動作下拉選項與表格「動作」欄 SHALL 使用同一份標籤呈現，未涵蓋的動作字串 SHALL fallback 顯示原始字串。

#### Scenario: 每個受控動作皆有中文標籤 (Every controlled action has a label)

- **WHEN** 讀取 `@vms/shared` 的 `AUDIT_ACTION_LABELS`
- **THEN** `AUDIT_ACTIONS` 中的每一個動作 SHALL 在 `AUDIT_ACTION_LABELS` 中有對應的非空字串標籤

#### Scenario: 下拉與表格使用同一標籤 (Dropdown and table share the same label)

- **GIVEN** 動作 `auth.login.success` 對應標籤為「登入成功」
- **WHEN** 前端渲染動作篩選下拉與表格「動作」欄
- **THEN** 兩處對該動作 SHALL 皆顯示「登入成功」，而非原始字串 `auth.login.success`

### Requirement: 自動記錄所有 API 請求 (Automatic Recording of API Requests)

系統 SHALL 透過 audit recording middleware (稽核記錄中介層)，在每個 `/api/*` 請求的 response 結束時寫入一筆稽核紀錄。`action`、`targetType`、`targetId` SHALL 由 HTTP method 與比對到的路由 (matched route) 推導。`GET /api/health` SHALL NOT 被記錄。

記錄行為 SHALL 為 best-effort (盡力而為)：寫入稽核紀錄失敗 SHALL NOT 改變或阻斷原請求的 HTTP 回應，且 SHALL 將錯誤輸出到 server log。稽核紀錄 SHALL 為 append-only (僅新增)：系統 SHALL NOT 提供任何修改或刪除既有稽核紀錄的 API。

`metadata` SHALL 包含該請求的參數快照 (parameter snapshot)，來源為 route params、query string 與 request body 的合併。為避免敏感資料外洩，key 名稱（不分大小寫）包含 `password`、`token`、`secret`、`authorization` 或 `csrf` 的欄位，其值 SHALL 被遮蔽為 `"[REDACTED]"`（遞迴套用至巢狀物件）。既有由 handler 設定的 `metadata` 內容（如登入失敗的 `reason`）SHALL 與參數快照合併保留。

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

#### Scenario: 請求參數寫入 metadata (Request parameters captured in metadata)

- **WHEN** admin 成功呼叫 `PATCH /api/vehicles/:id` 並帶有 request body（例如 `{ "color": "黑" }`）
- **THEN** 該筆稽核紀錄的 `metadata` SHALL 包含參數快照，且 SHALL 反映 path 中的 `:id` 與 body 欄位 `color`

#### Scenario: 敏感欄位被遮蔽 (Sensitive fields are redacted)

- **WHEN** admin 呼叫帶有 `password` 欄位的請求（例如 `POST /api/employees` 或 `POST /api/auth/login`）
- **THEN** 寫入的稽核紀錄 `metadata` 參數快照中，`password` 欄位的值 SHALL 為 `"[REDACTED]"`，且 SHALL NOT 包含明文密碼

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

`GET /api/audit-logs` SHALL 回傳分頁 (pagination) 結果，結構為 `{ items, page, pageSize, total, totalPages }`，預設 `pageSize = 20`、上限 `100`，預設依 `createdAt` 由新到舊排序。Query 參數 SHALL 由 `@vms/shared` 的 `auditLogListQuerySchema` 以 zod 驗證，並 SHALL 支援下列篩選：

- `search`：對 `actorUsername` 做不分大小寫的模糊比對，SHALL 支援以逗號分隔的多個關鍵字，任一關鍵字命中即納入（OR 比對）；空白 SHALL 被 trim、空關鍵字 SHALL 被略過。
- `action`：SHALL 支援以逗號分隔的多個值，每個值可為具體動作（如 `auth.login.success`）或動作前綴類別（如 `auth` / `employee` / `vehicle`）；多值之間為 OR 比對。
- `outcome`：SHALL 支援 `SUCCESS` / `FAILURE` 的單值或逗號分隔多值；`ALL`（或未提供）SHALL 表示不限制結果，預設不限制。
- `from` 與 `to`：`createdAt` 日期區間。

非法的 query 參數 SHALL 回 `400 VALIDATION_ERROR`。為向下相容，既有的單值呼叫（如 `action=auth`、`outcome=FAILURE`、`outcome=ALL`、單一 `search` 關鍵字）SHALL 仍然合法且行為不變。

#### Scenario: 預設分頁查詢 (Default paginated query)

- **WHEN** admin 呼叫 `GET /api/audit-logs` 不帶任何參數
- **THEN** response SHALL 為 HTTP 200，body SHALL 為 `{ items, page: 1, pageSize: 20, total, totalPages }`，且 `items` SHALL 依 `createdAt` 由新到舊排序

#### Scenario: 依結果篩選 (Filter by outcome)

- **WHEN** admin 呼叫 `GET /api/audit-logs?outcome=FAILURE`
- **THEN** response SHALL 為 HTTP 200，且 `items` 中每一筆的 `outcome` SHALL 皆為 `FAILURE`

#### Scenario: 依操作者與日期區間篩選 (Filter by actor and date range)

- **WHEN** admin 呼叫 `GET /api/audit-logs?search=<username>&from=<date>&to=<date>`
- **THEN** response SHALL 為 HTTP 200，且 `items` SHALL 僅包含 `actorUsername` 比對成功且 `createdAt` 落在區間內的紀錄

#### Scenario: 依多個具體動作篩選 (Filter by multiple specific actions)

- **WHEN** admin 呼叫 `GET /api/audit-logs?action=auth.login.success,vehicle.update`
- **THEN** response SHALL 為 HTTP 200，且 `items` 中每一筆的 `action` SHALL 為 `auth.login.success` 或 `vehicle.update` 之一

#### Scenario: 依多關鍵字操作者篩選 (Filter by multiple actor keywords)

- **WHEN** admin 呼叫 `GET /api/audit-logs?search=alice,bob`
- **THEN** response SHALL 為 HTTP 200，且 `items` 中每一筆的 `actorUsername` SHALL 包含 `alice` 或 `bob`（不分大小寫）

#### Scenario: 接受多個結果值 (Accepts multiple outcome values)

- **WHEN** admin 呼叫 `GET /api/audit-logs?outcome=SUCCESS,FAILURE`
- **THEN** response SHALL 為 HTTP 200，且 SHALL NOT 回 `VALIDATION_ERROR`

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

前端 SHALL 提供 `/audit-logs` 頁面，且 SHALL 由 `<RequireAdmin>` 守護：`role = USER` 的使用者導向此路由 SHALL 被導離 (redirect) 而無法看到內容。頁面 SHALL 以表格呈現稽核紀錄，欄位至少包含：時間 (`createdAt`)、操作者 (`actorUsername`)、動作 (`action`)、目標 (`targetType` / `targetId`)、結果 (`outcome`)、狀態碼 (`statusCode`)、API 參數 (`metadata`)、來源 IP (`ip`)；導覽列的 `/audit-logs` 入口 SHALL 僅對 admin 顯示。

「動作」欄 SHALL 以中文標籤（`AUDIT_ACTION_LABELS`）顯示，與動作篩選下拉的選項文字一致。「API 參數」欄 SHALL NOT 直接 inline 顯示完整 JSON，而是呈現精簡的觸發點：滑鼠移過 (hover) 時 SHALL 以 tooltip 顯示該筆 `metadata` 參數的完整內容，點擊時 SHALL 將完整內容複製到剪貼簿；當該筆無實質參數時 SHALL 以 `—` 表示。「來源 IP」欄上方 SHALL 提供遮蔽開關，預設為遮蔽（開）：遮蔽時 IPv4 顯示為 `a.*.*.d`，關閉時顯示完整 IP。

篩選 SHALL 提供：操作者（文字搜尋，支援逗號分隔多關鍵字）、動作（具體動作之複選 multi-select）、結果（`SUCCESS` / `FAILURE` 之複選）、日期區間，並 SHALL 提供分頁控制。

#### Scenario: admin 檢視稽核紀錄頁面 (Admin views audit log page)

- **WHEN** 一位 admin 開啟 `/audit-logs`
- **THEN** 頁面 SHALL 以表格呈現稽核紀錄，且 SHALL 提供操作者、動作、結果、日期區間篩選與分頁控制

#### Scenario: user 被擋於稽核紀錄頁面之外 (User is blocked from audit log page)

- **WHEN** 一位 `role = USER` 的使用者嘗試開啟 `/audit-logs`
- **THEN** 該使用者 SHALL 被導離且 SHALL NOT 看到稽核紀錄內容
- **AND** 導覽列 SHALL NOT 對該使用者顯示 `/audit-logs` 入口

#### Scenario: 動作欄顯示中文標籤 (Action column shows Chinese label)

- **GIVEN** 一筆紀錄的 `action` 為 `auth.login.success`
- **WHEN** admin 在表格中檢視該列
- **THEN** 「動作」欄 SHALL 顯示對應的中文標籤（如「登入成功」），而非原始字串 `auth.login.success`

#### Scenario: 來源 IP 預設遮蔽且可切換 (Source IP is masked by default and toggleable)

- **GIVEN** 一筆紀錄的 `ip` 為 `192.168.10.25`
- **WHEN** admin 開啟頁面（遮蔽開關預設為開）
- **THEN** 「來源 IP」欄 SHALL 顯示 `192.*.*.25`
- **WHEN** admin 關閉遮蔽開關
- **THEN** 「來源 IP」欄 SHALL 顯示完整的 `192.168.10.25`

#### Scenario: API 參數於 hover 顯示、點擊複製 (Parameters revealed on hover, copied on click)

- **GIVEN** 一筆紀錄的 `metadata` 含參數快照
- **WHEN** admin 將滑鼠移至該列「API 參數」欄的觸發點
- **THEN** SHALL 以 tooltip 顯示該筆參數的完整內容
- **WHEN** admin 點擊該觸發點
- **THEN** SHALL 將該筆參數的完整內容複製到剪貼簿，並 SHALL 顯示已複製的回饋

#### Scenario: 無實質參數顯示破折號 (No meaningful parameters shown as dash)

- **GIVEN** 一筆紀錄的 `metadata` 為空或僅含空的 `params`
- **WHEN** admin 在表格中檢視該列
- **THEN** 「API 參數」欄 SHALL 以 `—` 表示而非顯示觸發點

#### Scenario: 以具體動作複選篩選 (Filter by multi-selected specific actions)

- **WHEN** admin 在動作篩選下拉中勾選「登入成功」與「更新車輛」兩項
- **THEN** 列表 SHALL 僅顯示 `action` 為 `auth.login.success` 或 `vehicle.update` 的紀錄

#### Scenario: 以結果複選篩選 (Filter by multi-selected outcomes)

- **WHEN** admin 在結果篩選中僅勾選「失敗」
- **THEN** 列表 SHALL 僅顯示 `outcome = FAILURE` 的紀錄
