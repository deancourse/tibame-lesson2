## Context（背景）

操作紀錄頁面與 audit recording middleware 已由 `add-audit-log` change 落地（commit a30c5ee），但該 change 尚未歸檔，故 `audit-log` capability 尚未 sync 至 `openspec/specs/`。本 change 同時涵蓋兩塊互相獨立、但都屬 UX 優化的工作：(A) 操作紀錄頁面的篩選／顯示強化與後端參數記錄，(B) 跨頁面的版面與表單修正。

現況關鍵事實（已查證程式碼）：
- `apps/api/src/middleware/audit.ts`：在 `res.on("finish")` 寫入紀錄，目前 `metadata = res.locals.auditMeta ?? null`，僅登入失敗時帶 `{ reason }`，**未記錄任何請求參數**。
- `apps/api/src/routes/audit-logs.ts` + `packages/shared/src/schemas/audit.ts`：`action` 為單一字串（具體動作或類別前綴），`outcome` 為 `SUCCESS|FAILURE|ALL` 單值，`search` 為單一字串比對 `actorUsername`。
- `apps/web/src/pages/AuditLogs.tsx`：動作下拉只到「類別」層級，動作欄顯示原始字串，IP 明碼顯示。
- `apps/web/src/components/AppShell.tsx`：side bar 為 `h-screen sticky top-0`，使用者資訊同時出現在側欄左下與標頭右上。
- `apps/web/src/pages/Vehicles.tsx` 與 `Employees.tsx`：編輯時 `defaultValues` 傳 `new Date(...)` 給 `<input type="date">`。

## Goals / Non-Goals（目標／非目標）

**Goals:**
- 操作紀錄篩選由單值擴充為多值（多關鍵字 search、具體動作多選、結果多選），且向下相容既有 API 呼叫與測試。
- 後端在 `metadata` 寫入「遮蔽敏感欄位後」的請求參數，前端 hover 即可檢視。
- 來源 IP 預設遮蔽、可開關；動作欄顯示中文標籤。
- 修正側欄固定滿版、使用者身分單一顯示、車輛／員工編輯日期回填。

**Non-Goals:**
- 不新增 distinct actor 清單 API、不引入新第三方套件、不做 DB migration、不回填既有紀錄的 `metadata`。
- 不改變 IP 的儲存（遮蔽僅前端顯示）。

## Decisions（決策）

### D1. 先歸檔 `add-audit-log` 以建立 baseline，再 apply 本 change
- **決策**：本 change 對 `audit-log` 採 `MODIFIED Requirements`。實作前先將 `add-audit-log` 歸檔（或至少 sync `audit-log` spec 至 `openspec/specs/audit-log/`），讓 MODIFIED 有對應的 baseline requirement。
- **理由**：OpenSpec 的 MODIFIED delta 需與 baseline requirement 標題對齊；baseline 不存在會導致 verify 失敗。`add-audit-log` 的功能已實際落地，歸檔是自然的下一步。
- **替代方案**：將所有 audit 變更寫成 `ADDED Requirements`（不依賴 baseline）。否決：會與既有 requirement 語意重疊、archive 後 spec 出現重複/矛盾條目。

### D2. 多值 query 參數採「逗號分隔字串」+ zod preprocess 轉陣列，向下相容
- **決策**：`action` 與 `outcome` 接受逗號分隔字串（例：`action=auth.login.success,vehicle.update`、`outcome=SUCCESS,FAILURE`）。`auditLogListQuerySchema` 以 `z.preprocess` 將字串切成陣列再驗證；單一值（含既有 `outcome=ALL`）仍合法。`action` 每個元素可為具體動作或類別前綴（沿用既有前綴比對）。
- **理由**：GET 查詢以逗號分隔多值是常見慣例，且 `z.preprocess` 可保留既有單值呼叫與測試不破壊。後端對多值以 `OR`（Prisma `OR` / `in`）組合。
- **替代方案**：(a) 重複 query key（`?action=a&action=b`）— axios `params` 序列化較不直覺，且既有測試用單值字串；(b) 改用 POST + body — 違反「查詢用 GET」慣例。

### D3. `search` 多關鍵字以逗號分隔，做 OR 模糊比對
- **決策**：`search` 以逗號分隔多個關鍵字，對 `actorUsername` 做 `OR` 的 `contains`（case-insensitive）。空白會被 trim，空關鍵字略過。
- **理由**：與 D2 一致的分隔符，行為可預期；帳號通常不含逗號。
- **替代方案**：以空白分隔 — 否決，避免與含空白的輸入混淆，且逗號語意更明確。

### D4. 請求參數於 middleware 擷取並遮蔽，寫入 `metadata.params`
- **決策**：在 `res.on("finish")` 時，從 `req.params`／`req.query`／`req.body` 組出參數快照，遞迴遮蔽 key 名稱（case-insensitive）含 `password`、`token`、`secret`、`authorization`、`csrf` 者為 `"[REDACTED]"`，寫入 `metadata.params`（與既有 `res.locals.auditMeta` 合併，後者優先保留如 `reason`）。對過長值/物件做大小上限保護（如序列化超過上限則截斷並標記）。
- **理由**：稽核需要「呼叫了什麼」的證據；遮蔽 key 名單可避免外洩密碼/權杖。middleware 是唯一切面，集中處理最不易遺漏。
- **替代方案**：(a) 只記 `query`，不記 `body` — 對 create/update 類操作資訊不足；(b) 各 route handler 自行寫 `auditMeta` — 易遺漏、重複程式碼。
- **role-aware 備註**：此為記錄面，與授權無關；既有 `requireAuth`／`requireAdmin` 與 USER 車輛範圍限縮邏輯不受影響。

### D5. IP 遮蔽放前端，資料庫保存完整 IP
- **決策**：IPv4 `a.b.c.d` 顯示為 `a.*.*.d`；非標準/IPv6 格式做合理 fallback（遮蔽中段或顯示 `***`）。欄位上方提供開關，**預設遮蔽（開）**。
- **理由**：稽核紀錄須保留原始 IP 作為證據；遮蔽屬顯示層，開關可即時切換、不需重查 API；符合與使用者確認的預設。
- **替代方案**：後端遮蔽 — 否決，會喪失證據、且開關需往返後端。

### D6. `AUDIT_ACTION_LABELS` 置於 `@vms/shared`，動作下拉改「具體動作」複選
- **決策**：在 `packages/shared/src/schemas/audit.ts` 新增 `AUDIT_ACTION_LABELS: Record<(typeof AUDIT_ACTIONS)[number], string>`（19 個 action 的中文標籤），由 `index.ts` 重新匯出。動作下拉選項 = `AUDIT_ACTIONS`，顯示 `AUDIT_ACTION_LABELS`；表格動作欄亦以同表轉中文，未知 action fallback 顯示原始字串。
- **理由**：標籤與 `AUDIT_ACTIONS` 同源，避免前後端漂移（drift）；表格與下拉共用同一份標籤，自然達成「對齊下拉選單」。
- **替代方案**：前端 local map — 否決，與 `AUDIT_ACTIONS` 易脫鉤。

### D7. 多選下拉與參數 tooltip 用既有 primitive 自製，不新增第三方套件
- **決策**：多選以 shadcn 既有的 `Popover` + `Checkbox`（或核取清單）自製；參數欄不直接 inline 顯示 JSON（過長），改放精簡的「檢視」觸發點，hover 才浮出自訂卡片（`<pre>` 格式化 JSON）。卡片以 `position: fixed`＋觸發點 `getBoundingClientRect` 計算座標，並用 React `createPortal` 掛到 `document.body`，避免被表格 `overflow-auto` 裁切或被列進場動畫殘留的 `transform` 變成相對定位；下方空間不足時往上翻。無實質參數（空 `{"params":{}}`）顯示 `—`。不引入 Radix tooltip 等新依賴（`createPortal` 來自既有的 `react-dom`）。
- **理由**：遵循 repo「不雙重造輪、優先既有 shadcn」慣例，避免 bundle 與維護成本；inline 顯示長 JSON 會撐爆欄寬，hover 浮卡更乾淨。
- **替代方案**：引入 `react-select` / Radix Tooltip 等套件 — 否決，與既有 UI 風格不一致且屬多餘依賴；原生 `title` 屬性 — 否決，純文字、無法格式化且有系統延遲。

### D8. 側欄固定滿版改採「外層不捲、主區獨立捲動」佈局
- **決策**：將 `AppShell` 外層改為 `h-screen overflow-hidden` 的 flex 容器；側欄 `h-full shrink-0`（自身不捲）；右側容器 `flex-1 min-w-0 flex flex-col`，其中 `main` 設 `flex-1 overflow-y-auto`。aurora 背景層維持覆蓋。
- **理由**：讓側欄真正固定且 100% 高度，僅主內容捲動，這是固定側欄的標準解。
- **替代方案**：`position: fixed` 側欄 + 主區 `margin-left` — 否決，需手動維護寬度、RWD 與堆疊較脆弱。

### D9. 編輯表單日期回填取 ISO 字串前 10 碼
- **決策**：`defaultValues` 的 `purchasedAt`／`hiredAt` 改為來源 ISO 字串的前 10 碼（`YYYY-MM-DD`），直接餵給 `<input type="date">`。
- **理由**：DTO 的日期為 ISO 字串，取日期部分即當日，避免 `new Date().toISOString()` 因 UTC 轉換產生跨日位移（off-by-one）。
- **替代方案**：用 `Controller` 包裝 + 格式轉換 — 可行但較重；本問題用字串回填即可解。提交時既有 `z.coerce.date()` 仍能將字串轉回 `Date`。

## Risks / Trade-offs（風險與取捨）

- [既有測試假設單值 `outcome`/`action`] → D2 以 `z.preprocess` 保持單值合法，並新增多值測試，先跑既有 audit 測試確認無回歸。
- [`metadata.params` 可能記錄到非預期敏感欄位] → 採 key 名單遮蔽 + 值大小上限；遮蔽清單集中於 middleware 一處，後續可擴充。新需求測試明確驗證 `password` 被遮蔽。
- [`req.body` 在 `res.on("finish")` 時是否仍可讀] → express.json 解析後 `req.body` 物件保留至請求結束，finish 時可安全讀取；GET 通常無 body，主要來源為 `query`/`params`。
- [baseline 未 sync 導致 verify 失敗] → 見 D1，apply 前先歸檔/sync `add-audit-log`。
- [IP 遮蔽僅前端，前端可還原] → 可接受：完整 IP 對 admin 本就可見，遮蔽目的是預設降低肩窺/截圖外洩，非權限控制。
- [側欄佈局改版影響其他頁面捲動] → 主區改 `overflow-y-auto` 後各頁以內部捲動；驗證 dashboard/vehicles/employees/audit 長內容捲動正常。

## Migration Plan（遷移計畫）

1. （前置）歸檔或 sync `add-audit-log`，使 `openspec/specs/audit-log/` 成為 baseline。
2. `@vms/shared`：擴充 `auditLogListQuerySchema`（多值）、新增 `AUDIT_ACTION_LABELS`，`index.ts` 匯出。
3. `@vms/api`：middleware 寫入遮蔽後 `metadata.params`；route 支援多值篩選。補測試。
4. `@vms/web`：AuditLogs 頁面（複選、參數欄 tooltip、IP 遮蔽開關、動作中文標籤）、AppShell（佈局＋身分整合）、Vehicles/Employees 日期回填。補測試。
- **Rollback**：純程式碼變更、無 migration，回退 commit 即可；`metadata.params` 為新增欄位內容，不影響既有紀錄。

## Open Questions（待解問題）

- 無阻斷性問題。tooltip 是否新增 Radix 依賴於實作時依現況決定（見 D7 fallback）。
