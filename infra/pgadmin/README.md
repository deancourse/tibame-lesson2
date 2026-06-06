# pgAdmin（Postgres Admin 網頁）

`docker compose up -d` 會一併啟動 pgAdmin（http://localhost:5050）。

## 登入

- Email：`admin@example.com`
- Password：`admin`

（這兩個值定義在根 `.env` 的 `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD`，可自行修改）

## 連到 Postgres

**不需要手動 add server**。pgAdmin 啟動時已自動從 `servers.json` 載入一條連線，並透過 `pgpass` 預載密碼。登入後直接：

1. 左側 server tree 展開 **Servers → VMS local**
2. 展開 **Databases → vms → Schemas → public → Tables**
3. 可以看到 `Employee` 與 `Vehicle` 兩張表
4. 對著 table 按右鍵 → **View/Edit Data → All Rows** 即可查資料

## 如果要手動建立 Server（萬一 servers.json 沒生效）

按左側 Servers → 右鍵 → Register → Server，填：

| 分頁 | 欄位 | 值 |
|---|---|---|
| General | Name | 任意，例如 `VMS local` |
| Connection | Host name/address | **`db`**（這是 docker network 內的服務名，不是 `localhost`） |
| Connection | Port | `5432` |
| Connection | Maintenance database | `vms` |
| Connection | Username | `vms` |
| Connection | Password | `vms`（勾「Save password」省得每次再輸入） |

> 如果你是從 **host machine 直接連**（例如 `psql`、TablePlus、DBeaver），則用 `localhost:5432` / `vms` / `vms` / `vms`。`db` 這個 hostname 只在 docker compose network 內有效。
