## Context（背景與現況）

VMS 目前完全沒有 audit trail (稽核軌跡)。所有 `/api/*` 請求都流經一條固定的 middleware 鏈（`helmet` → `cors` → `express.json` → `cookieParser` → `employeesMethodOverride` → `csrfGuard` → routers → `notFoundHandler` → `errorHandler`），而授權靠 `requireAuth`（解析 JWT cookie，填 `req.user`）與 `requireAdmin` 兩層 middleware。錯誤統一由 `errorHandler` 轉成 `{ error: { code, message, details } }`。

本 change 要在「不更動既有端點對外 contract」的前提下，橫切式 (cross-cutting) 地記錄每個請求。挑戰在於：(1) 失敗登入時沒有 `req.user`，actor 必須另尋來源；(2) action 語意需從 method + 路由推導；(3) 記錄不可拖慢或拖垮主請求；(4) 既有 API 測試共用單一 dev DB 並以 `resetDb()` 清表，新表必須一併納入清理。

## Goals / Non-Goals（目標／非目標）

**Goals:**
- 以單一中介層自動記錄所有 `/api/*`（`/api/health` 除外）請求，涵蓋登入事件、資料異動與敏感讀取。
- 記錄為 best-effort：寫入失敗只記 server log，絕不改變主請求回應。
- 提供 admin-only 的列表（分頁＋篩選）與詳情查詢端點，以及前端 `/audit-logs` 頁面。
- 稽核紀錄 append-only：無任何修改／刪除 API。

**Non-Goals:**
- 保留期限與自動／手動清理機制（永久保留，本 change 不處理）。
- 匯出 (CSV / 下載)、即時告警、異常偵測。
- 記錄 request/response body 內容（只記 method/path/status/target 等中繼資料 (metadata)，避免存入密碼等敏感欄位）。
- 變更既有 auth / employees / vehicles / dashboard 端點的對外行為。

## Decisions（決策）

### D1：以「response finish hook」中介層記錄，而非在每個 handler 內手動呼叫

在 middleware 鏈最前段（緊接 `cookieParser` 之後、`employeesMethodOverride` 之前）註冊 `auditMiddleware`，於 `res.on("finish")` 時取得最終 `res.statusCode` 並寫入一筆紀錄。

- **理由**：單一進入點即可涵蓋「全部含讀取」需求，不必在十多個 handler 重複埋點；`finish` 事件能拿到真實狀態碼（含被 `errorHandler` 改寫後的 4xx/5xx）。放在 `employeesMethodOverride` 之前，才能記錄到回 405 的刪除嘗試。
- **替代方案**：(a) 每個 handler 內手動呼叫 logger — 易漏記、與「含讀取」目標衝突、維護成本高；(b) Prisma middleware 層攔截 — 只能看到 DB 操作，無法對應 HTTP 語意（登入失敗、405、GET 讀取都不一定有 DB 寫入），且無 actor/IP。

### D2：actor 來源優先序 — `res.locals.auditActor` → `req.user` → null

`auditMiddleware` 取 actor 的順序為：handler 明確設定的 `res.locals.auditActor`（用於登入成功，因為 `requireAuth` 不會在 `/login` 跑）優先，其次是 `requireAuth` 填的 `req.user`，都沒有則為匿名 (null)。登入 handler 於成功時把解析出的 employee 寫進 `res.locals.auditActor`，失敗時把提交的 `username` 寫進 `res.locals.auditUsername`（`actorId` 維持 null）。

- **理由**：登入是唯一「成功才知道 actor、失敗仍要記帳號」的特例，用 `res.locals` 由 handler 補充最乾淨，不污染其他路由。
- **替代方案**：在 middleware 內自行解 JWT — 對失敗登入無效（尚未發 token），且與 `requireAuth` 重複解析。

### D3：action 由 `(method, 路由樣板)` 對應表推導，詞彙集中在 `@vms/shared`

維護一份 route → action 對應表（例如 `GET /api/employees` → `employee.read.list`、`GET /api/employees/:id` → `employee.read.detail`、`POST /api/employees` → `employee.create`…），`AUDIT_ACTIONS` 受控詞彙與 query 用的類別前綴（`auth` / `employee` / `vehicle` / `dashboard` / `audit`）由 `@vms/shared` 匯出。比對不到時退回 `${resource}.${method.toLowerCase()}` 並仍寫入（避免漏記）。

- **理由**：語意化 action 讓前端篩選與閱讀直覺；集中於 shared 遵守「不雙邊重複定義」慣例。
- **替代方案**：只存 raw method+path 不做語意化 — 前端難以分類篩選，且每次都要在 UI 重算語意。

### D4：`targetType` / `targetId` 由路由 path param 推導；`metadata` 存補充資訊

`targetId` 取自比對到的 path param（`:id`），`targetType` 取自 resource 段。`metadata` 為 JSON 欄位，僅存少量結構化補充（如登入失敗 `reason`），**不存** request body、密碼或完整 response。

- **理由**：滿足「對哪一筆資料」的追溯需求，同時避免把敏感輸入寫進稽核表造成二次外洩。
- **替代方案**：序列化整個 body 進 metadata — 會存入 `initialPassword` / `newPassword` 等欄位，違反安全原則。

### D5：best-effort 寫入 — fire-and-forget 且 try/catch 吞例外

`res.on("finish")` 的 callback 內呼叫 `auditLogger.record(...)`，以 `.catch()` 或 try/catch 包住，失敗只 `console.error`（與既有 `errorHandler` 的 server log 風格一致），不 await 在請求關鍵路徑上。

- **理由**：稽核是輔助功能，絕不能因稽核表故障導致使用者操作失敗或變慢。
- **替代方案**：同步 await 寫入後才回應 — 會把 DB 寫入延遲疊加到每個請求，且稽核故障會連帶讓主功能掛掉。

### D6：授權沿用 `requireAuth` + `requireAdmin`，查詢端點 admin-only

`/api/audit-logs` router 整段掛 `requireAuth, requireAdmin`，與 employees 端點一致。稽核頁面記錄者不分角色（USER 的讀取也會被記），但**查閱**稽核紀錄僅限 ADMIN（符合 proposal「供管理者查看」）。前端 `/audit-logs` 由 `<RequireAdmin>` 守護，導覽列入口僅 admin 可見。

- **理由**：與既有 admin-only 資源（employees）的授權模型一致，降低心智負擔。
- **替代方案**：開放 USER 查自己的紀錄（role-aware 過濾 `actorId = self`）— 超出本次「供管理者查看」需求，且增加洩漏其他人存在性的風險面，故不採用。

### D7：列表預設新到舊、分頁與 query schema 沿用既有 list 慣例

`auditLogListQuerySchema` 比照 `employeeListQuerySchema`：`page` / `pageSize`（預設 20、上限 100）＋ `search`（比對 `actorUsername`）＋ `action`（單值或類別前綴）＋ `outcome`（`SUCCESS`/`FAILURE`/`ALL`，預設 `ALL`）＋ `from`/`to`（日期區間，以 `z.coerce.date()`）。`orderBy: { createdAt: "desc" }`，並對 `createdAt`、`actorId`、`action`、`outcome` 建索引。

- **理由**：與既有列表端點一致；稽核資料量會持續成長（永久保留），索引確保篩選效能。
- **替代方案**：不建索引 — 永久保留下查詢會隨資料量線性退化。

## Risks / Trade-offs（風險與取捨）

- **[每個請求多一次 DB 寫入]** → fire-and-forget 不阻塞回應（D5）；單機內部系統、流量低，可接受。若日後量大，可改批次寫入或非同步 queue。
- **[「全部含讀取」+ 永久保留 → 資料量無上限成長]** → 本 change 明列為 Non-goal；已建索引維持查詢效能，後續可另開 change 補保留期限／清理。
- **[稽核表本身的讀取也被記錄，admin 每次開頁面都產生 `audit.read.*` 紀錄]** → 屬預期行為（admin 的查閱也是可稽核事件）；不過濾，以免製造盲點。
- **[`res.locals.auditActor` 需 handler 配合，漏設會讓登入成功記成匿名]** → 以 API 測試覆蓋「登入成功紀錄含 actor」防止回歸。
- **[共用 dev DB 的測試污染]** → 必須在 `src/test/setup.ts` 的 `resetDb()` truncate 清單中加入 `audit_log`，否則跨測試殘留紀錄會干擾筆數斷言。

## Migration Plan（遷移計畫）

1. 在 `@vms/shared` 新增 `schemas/audit.ts`（`AUDIT_ACTIONS`、`auditLogListQuerySchema`、type）並從 `index.ts` re-export；在 `errors.ts` 加入 `AUDIT_LOG_NOT_FOUND`。
2. Prisma schema 新增 `AuditLog` model 與 `AuditOutcome` enum，跑 `prisma migrate dev --name add_audit_log` 產生 migration。
3. 實作 `audit-logger` service（route→action 對應、record）、`auditMiddleware`，於 `app.ts` 註冊（`cookieParser` 之後、`employeesMethodOverride` 之前）。
4. 登入 handler 補 `res.locals.auditActor` / `auditUsername`。
5. 新增 `audit-logs` router 與序列化、`app.ts` 掛載。
6. `src/test/setup.ts` 的 `resetDb()` 加入 truncate `audit_log`。
7. 前端：新增 `/audit-logs` 頁面、`App.tsx` 路由（`<RequireAdmin>`）、`AppShell` 導覽列入口（admin 限定）。
8. 測試：API（記錄行為、授權、分頁篩選、best-effort）＋ Web（route guard、列表篩選）。

**Rollback**：純新增（新表、新檔、新路由）。回滾移除 router/middleware 註冊與前端入口即可；資料表可保留或以反向 migration drop，不影響既有功能。

## Open Questions（待解問題）

- 無阻擋實作的未決問題。保留期限／清理留待後續 change（已於 Non-goals 標示）。
