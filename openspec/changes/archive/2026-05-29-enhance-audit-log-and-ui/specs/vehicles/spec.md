## MODIFIED Requirements

### Requirement: 車輛前端頁面 (Vehicle Frontend Pages)

Web app SHALL 提供 `/vehicles` 路由，呈現具分頁與搜尋功能的 data table (資料表)。admin SHALL 看到「新增車輛」按鈕與每一列的「編輯」「刪除」操作；user SHALL NOT 看到任何 mutation (變更) 按鈕。建立／編輯車輛表單中，`make`、`color` 欄位 SHALL 為 dropdown (下拉選單)，選項分別來自 `@vms/shared` 的 `VEHICLE_MAKES` 與 `VEHICLE_COLORS`；`ownerId` 欄位 SHALL 為 dropdown，選項來自當前 ACTIVE 員工清單（含「未指派」對應 `null`）。列表「負責員工」欄 SHALL 顯示為「`姓名（工號）`」格式，而非 raw uuid。

編輯既有車輛時，「購買日期」(`purchasedAt`) 欄位（`<input type="date">`）SHALL 以該車輛既有日期正確回填，顯示為 `YYYY-MM-DD`，SHALL NOT 顯示為空白。

#### Scenario: admin 看到變更按鈕 (Admin sees mutation controls)

- **WHEN** admin 進入 `/vehicles`
- **THEN** 頁面 SHALL 顯示「新增車輛」按鈕
- **AND** 每一列 SHALL 顯示「編輯」與「刪除」按鈕

#### Scenario: user 看不到變更按鈕 (User does not see mutation controls)

- **WHEN** user 進入 `/vehicles`
- **THEN** 頁面 SHALL NOT 顯示任何新增／編輯／刪除按鈕或 menu (選單) 項目

#### Scenario: 刪除需二次確認 (Delete requires confirmation)

- **WHEN** admin 點擊某一列的「刪除」
- **THEN** SHALL 跳出 confirmation dialog (確認對話框)，使用者需明確按下確認後才會送出 `DELETE /api/vehicles/:id`

#### Scenario: make、color、ownerId 為下拉選擇 (Make, color and owner render as dropdowns)

- **WHEN** admin 開啟「新增車輛」或「編輯車輛」表單
- **THEN** `make` 欄位 SHALL 渲染為 dropdown，選項等於 `VEHICLE_MAKES`
- **AND** `color` 欄位 SHALL 渲染為 dropdown，選項等於 `VEHICLE_COLORS`
- **AND** `ownerId` 欄位 SHALL 渲染為 dropdown，選項為當前所有 ACTIVE 員工（顯示「`姓名（工號）`」）加上「未指派」一項（送出時對應 `null`）
- **AND** 表單 SHALL NOT 渲染為可自由輸入的 text input

#### Scenario: 列表「負責員工」欄顯示人類可讀名稱 (Owner column shows human-readable name)

- **GIVEN** vehicle V 的 `ownerId` 對應到員工 E（`name = "陳志明"`、`employeeNo = "EMP0007"`）
- **WHEN** admin 進入 `/vehicles` 並看到 V 的列
- **THEN** 「負責員工」欄 SHALL 顯示「`陳志明（EMP0007）`」，而非 V 的 `ownerId` uuid

#### Scenario: 未指派或員工不存在時的 fallback (Fallback when owner is missing)

- **GIVEN** vehicle V 的 `ownerId` 為 `null`，或對應員工已不在 ACTIVE lookup 中（例如該員工已被改為 INACTIVE 而未重新拉取 lookup）
- **WHEN** admin 進入 `/vehicles` 並看到 V 的列
- **THEN** 「負責員工」欄 SHALL 顯示「未指派」

#### Scenario: USER 角色不觸發員工 lookup 請求 (USER does not fetch employee lookup)

- **WHEN** USER 角色登入並進入 `/vehicles`
- **THEN** 前端 SHALL NOT 對 `/api/employees` 發送任何請求（避免 403）
- **AND** 「負責員工」欄 SHALL 顯示登入者自身的姓名（取自 auth session）

#### Scenario: 編輯車輛時購買日期正確回填 (Purchase date is prefilled when editing)

- **GIVEN** vehicle V 的 `purchasedAt` 為 `2024-01-15`
- **WHEN** admin 開啟 V 的「編輯車輛」表單
- **THEN** 「購買日期」欄位 SHALL 顯示 `2024-01-15`，SHALL NOT 為空白
