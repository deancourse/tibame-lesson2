## ADDED Requirements

### Requirement: 應用程式外殼版面 (Application Shell Layout)

登入後的頁面 SHALL 由共用的應用程式外殼 (application shell) 包覆，包含固定的左側導覽側欄 (sidebar)、頂部標頭 (header) 與主內容區 (main content)。側欄 SHALL 固定為視窗 100% 高度且 SHALL NOT 隨主內容捲動；當主內容高度超過視窗時，SHALL 僅主內容區出現捲動，側欄與標頭 SHALL 保持固定可見。

#### Scenario: 主內容過長時側欄保持固定 (Sidebar stays fixed when content overflows)

- **GIVEN** 某頁面的主內容高度超過視窗高度
- **WHEN** 使用者向下捲動主內容
- **THEN** 左側側欄 SHALL 維持固定且滿版（100% 視窗高度）可見
- **AND** 頂部標頭 SHALL 維持固定可見
- **AND** 僅主內容區 SHALL 捲動

#### Scenario: 導覽入口依角色顯示 (Navigation entries are role-aware)

- **WHEN** 一位 `role = USER` 的使用者檢視側欄
- **THEN** 側欄 SHALL NOT 顯示僅限 admin 的入口（員工、操作紀錄）
- **WHEN** 一位 `role = ADMIN` 的使用者檢視側欄
- **THEN** 側欄 SHALL 顯示員工與操作紀錄入口

### Requirement: 使用者身分單一顯示 (Single Source of Identity Display)

外殼中使用者的身分資訊（姓名與角色）SHALL 僅顯示於左下角側欄一處，SHALL NOT 在標頭重複顯示歡迎詞或姓名。標頭 SHALL 保留主題切換 (theme toggle) 與登出 (logout) 控制項。

#### Scenario: 身分僅顯示於側欄 (Identity shown only in sidebar)

- **WHEN** 已登入使用者檢視任一頁面
- **THEN** 使用者姓名與角色 SHALL 顯示於左下角側欄
- **AND** 頂部標頭 SHALL NOT 顯示使用者姓名或「歡迎回來」字樣

#### Scenario: 標頭保留主題與登出控制 (Header keeps theme and logout controls)

- **WHEN** 已登入使用者檢視標頭
- **THEN** 標頭 SHALL 提供主題切換按鈕與登出按鈕
