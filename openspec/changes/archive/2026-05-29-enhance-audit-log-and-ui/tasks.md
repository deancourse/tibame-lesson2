## 1. Baseline 前置 (Prerequisite)

- [x] 1.1 將 `add-audit-log` change 歸檔（或以 `opsx:sync` 將其 `audit-log` spec 同步至 `openspec/specs/audit-log/`），建立本 change MODIFIED 所需 baseline（見 design.md D1）— 已由 commit e2e12dd 完成
- [x] 1.2 歸檔/同步後執行 `openspec validate enhance-audit-log-and-ui --strict` 確認 audit-log MODIFIED 對齊 baseline 無誤

## 2. Shared 層 (@vms/shared)

- [x] 2.1 在 `packages/shared/src/schemas/audit.ts` 擴充 `auditLogListQuerySchema`：`action` 以 `z.preprocess` 接受逗號分隔字串→陣列；`outcome` 接受 `SUCCESS|FAILURE` 的單值或逗號分隔多值並相容 `ALL`；`search` 維持字串（後端負責切多關鍵字）。保持單值呼叫向下相容
- [x] 2.2 在 `packages/shared/src/schemas/audit.ts` 新增 `AUDIT_ACTION_LABELS: Record<(typeof AUDIT_ACTIONS)[number], string>`，為 19 個動作提供繁體中文標籤
- [x] 2.3 於 `packages/shared/src/index.ts` 重新匯出 `AUDIT_ACTION_LABELS` 與更新後的型別；確認前後端 import 不破壞（`export *` 已涵蓋，exports 指向 source 免 build）

## 3. API 層 (@vms/api)

- [x] 3.1 在 `apps/api/src/middleware/audit.ts` 擷取 `req.params`／`req.query`／`req.body` 組成參數快照，遞迴遮蔽 key 含 `password`/`token`/`secret`/`authorization`/`csrf` 之值為 `"[REDACTED]"`，並與既有 `res.locals.auditMeta` 合併寫入 `metadata.params`；加上序列化大小上限保護
- [x] 3.2 在 `apps/api/src/routes/audit-logs.ts` 將 `action` 多值組成 OR（具體動作 `equals` 或類別前綴 `startsWith`）、`outcome` 多值組成 `in`、`search` 以逗號切多關鍵字組成 `actorUsername` 的 OR `contains`
- [x] 3.3 新增/更新 jest + supertest 測試：多值 `action`、多值 `outcome`、多關鍵字 `search` 篩選結果正確；保留既有單值行為（向下相容）；驗證 `/api/audit-logs` 的 401（未登入）與 403（USER）路徑不變
- [x] 3.4 新增測試：`metadata.params` 含 route/body 參數；含 `password` 的請求其 `metadata` 中 `password` 為 `"[REDACTED]"`，且不含明文（以 `flushAuditLogs()` 等待寫入）

## 4. Web 層 — 操作紀錄頁面 (apps/web AuditLogs)

- [x] 4.1 新增可重用的多選下拉元件（改用既有 `@radix-ui/react-dropdown-menu` 的 `CheckboxItem` 自製 `MultiSelect`），不引入新第三方套件
- [x] 4.2 確認 `apps/web/src/components/ui/tooltip.tsx` 不存在且無 Radix tooltip 依賴；依 design.md D7 退回原生 `title` fallback 顯示參數
- [x] 4.3 新增 IP 遮蔽工具函式（IPv4 → `a.*.*.d`，非標準格式合理 fallback）並加單元測試
- [x] 4.4 改寫 `AuditLogs.tsx` 篩選器：操作者改為多關鍵字文字搜尋、動作改為「具體動作」複選（選項用 `AUDIT_ACTIONS`＋`AUDIT_ACTION_LABELS`）、結果改為複選；query 參數以逗號分隔送出
- [x] 4.5 表格「動作」欄改用 `AUDIT_ACTION_LABELS` 顯示中文標籤（未知 fallback 原始字串）；新增「API 參數」欄並以原生 title 於 hover 顯示 `metadata` 完整內容
- [x] 4.6 「來源 IP」欄上方加遮蔽開關，預設遮蔽（開）；切換可顯示完整 IP
- [x] 4.7 Vitest + RTL 測試：動作中文標籤渲染、IP 預設遮蔽與切換、參數 hover 顯示（複選下拉互動行為以手動驗證為主）

## 5. Web 層 — UI／版面修正 (apps/web Shell & Forms)

- [x] 5.1 改寫 `AppShell.tsx` 佈局：外層 `h-screen overflow-hidden` flex；側欄 `h-full shrink-0` 不捲；主內容區 `flex-1 overflow-y-auto`，確認 aurora 背景仍覆蓋（見 design.md D8）
- [x] 5.2 移除標頭「歡迎回來，{name}」，使用者姓名與角色僅留左下角側欄；標頭保留主題切換與登出
- [x] 5.3 修正 `Vehicles.tsx` 編輯表單 `purchasedAt` 的 `defaultValues`：以來源 ISO 字串前 10 碼（`YYYY-MM-DD`）回填（見 design.md D9）
- [x] 5.4 修正 `Employees.tsx` 編輯表單 `hiredAt` 的 `defaultValues`：同上以 `YYYY-MM-DD` 字串回填
- [x] 5.5 Vitest + RTL 測試：編輯車輛時購買日期正確回填、編輯員工時入職日期正確回填；側欄/標頭身分不重複

## 6. 驗證與收尾 (Verification)

- [x] 6.1 執行 `npm run lint` 與 `npm test`（root + 各 workspace）全綠（API 56、web 25，build/tsc 通過）
- [x] 6.2 手動驗證 `/audit-logs`：複選篩選、參數 hover、IP 開關、動作中文標籤；以及側欄固定滿版、身分單一顯示、兩個編輯彈窗日期回填（以 Playwright MCP 視覺驗證通過：動作多選 OR、結果多選、動作∩結果組合篩選、API 參數 hover 帶 `[REDACTED]`、IP 預設遮蔽且開關可切換、19 動作中文標籤、側欄固定主內容獨立捲動、身分僅左下側欄且標頭無「歡迎回來」、車輛購買日期 2025-09-07／員工入職日期 2020-08-21 正確回填）
- [x] 6.3 執行 `openspec validate enhance-audit-log-and-ui --strict`（通過），再以 `opsx:verify` 確認實作與 specs 一致（無實作層 critical 缺口）
