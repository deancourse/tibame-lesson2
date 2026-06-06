## ADDED Requirements

### Requirement: 動作語意化標籤 (Audit Action Semantic Labels)

`@vms/shared` SHALL 匯出 `AUDIT_ACTION_LABELS`，為 `AUDIT_ACTIONS` 中每一個動作提供對應的繁體中文標籤（label）。`AUDIT_ACTION_LABELS` SHALL 與 `AUDIT_ACTIONS` 同源維護，前後端共用；前端的動作下拉選項與表格「動作」欄 SHALL 使用同一份標籤呈現，未涵蓋的動作字串 SHALL fallback 顯示原始字串。

#### Scenario: 每個受控動作皆有中文標籤 (Every controlled action has a label)

- **WHEN** 讀取 `@vms/shared` 的 `AUDIT_ACTION_LABELS`
- **THEN** `AUDIT_ACTIONS` 中的每一個動作 SHALL 在 `AUDIT_ACTION_LABELS` 中有對應的非空字串標籤

#### Scenario: 下拉與表格使用同一標籤 (Dropdown and table share the same label)

- **GIVEN** 動作 `auth.login.success` 對應標籤為「登入成功」
- **WHEN** 前端渲染動作篩選下拉與表格「動作」欄
- **THEN** 兩處對該動作 SHALL 皆顯示「登入成功」，而非原始字串 `auth.login.success`

## MODIFIED Requirements

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
