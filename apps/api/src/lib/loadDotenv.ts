import dotenv from "dotenv";
import path from "node:path";

// 從 repo 根載入共享 .env。所有 api script（dev / start / seed / db:* / test）
// 的 cwd 都是 apps/api，因此 ../../.env 一律指向 repo 根目錄。
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
