## MODIFIED Requirements

### Requirement: 員工管理前端頁面 (Employees Frontend Page)

Web app SHALL 提供 `/employees` 路由，且 SHALL 僅供 admin 存取。非 admin 進入 `/employees` SHALL 被導回 `/`，且 SHALL NOT 看到頁面內容或觸發任何對 `/api/employees*` 的 API 呼叫。建立／編輯員工表單中，`department` 與 `position` 欄位 SHALL 為 dropdown (下拉選單)，選項分別來自 `@vms/shared` 的 `DEPARTMENTS` 與 `POSITIONS`；SHALL NOT 接受自由文字輸入。

編輯既有員工時，「入職日期」(`hiredAt`) 欄位（`<input type="date">`）SHALL 以該員工既有日期正確回填，顯示為 `YYYY-MM-DD`，SHALL NOT 顯示為空白。

#### Scenario: admin 進入頁面 (Admin renders the page)

- **WHEN** admin 進入 `/employees`
- **THEN** 頁面 SHALL 渲染員工 data table、搜尋、篩選器與「新增員工」按鈕

#### Scenario: user 被導回首頁 (User is redirected)

- **WHEN** user 進入 `/employees`
- **THEN** client SHALL 將其導回 `/`，且 SHALL NOT 對任何 `/api/employees*` endpoint 發送請求

#### Scenario: 重設密碼 UI (Reset password UI)

- **WHEN** admin 點擊某員工列的「重設密碼」
- **THEN** SHALL 跳出 dialog 要求輸入新密碼，並 SHALL 在前端驗證長度 ≥ 8 後呼叫 `POST /api/employees/:id/reset-password`

#### Scenario: department 與 position 為下拉選擇 (Department and position render as dropdowns)

- **WHEN** admin 開啟「新增員工」或「編輯員工」表單
- **THEN** `department` 欄位 SHALL 渲染為 dropdown，選項等於 `DEPARTMENTS`；`position` 欄位 SHALL 渲染為 dropdown，選項等於 `POSITIONS`
- **AND** 表單 SHALL NOT 渲染為可自由輸入的 text input

#### Scenario: 編輯舊資料時遇到不在詞彙內的值 (Editing legacy out-of-vocabulary value)

- **GIVEN** 既有 employee 的 `department` 為不在 `DEPARTMENTS` 中的歷史值
- **WHEN** admin 開啟其「編輯員工」表單
- **THEN** `department` dropdown SHALL 顯示 placeholder 並要求重選；submit 時若仍為非詞彙值 SHALL 由前端 zod validation 擋下並顯示錯誤

#### Scenario: 編輯員工時入職日期正確回填 (Hire date is prefilled when editing)

- **GIVEN** employee E 的 `hiredAt` 為 `2023-09-01`
- **WHEN** admin 開啟 E 的「編輯員工」表單
- **THEN** 「入職日期」欄位 SHALL 顯示 `2023-09-01`，SHALL NOT 為空白
