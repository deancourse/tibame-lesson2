import { z } from "zod";
import type { Role } from "../types.js";

// 稽核結果 (outcome)：依 HTTP 狀態碼推導，< 400 為 SUCCESS，否則 FAILURE。
export const AUDIT_OUTCOMES = ["SUCCESS", "FAILURE"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

// 動作類別 (category)：action 的前綴，供列表頁以類別篩選。
export const AUDIT_ACTION_CATEGORIES = [
  "auth",
  "employee",
  "vehicle",
  "dashboard",
  "audit",
] as const;
export type AuditActionCategory = (typeof AUDIT_ACTION_CATEGORIES)[number];

// 語意化動作 (action) 受控詞彙：涵蓋所有已知端點。未知路徑由後端 deriveAction 退回
// `${resource}.${method}` 以避免漏記（見 design.md D3）。
export const AUDIT_ACTIONS = [
  "auth.login.success",
  "auth.login.failure",
  "auth.logout",
  "auth.session.read",
  "auth.register.blocked",
  "employee.read.list",
  "employee.read.detail",
  "employee.create",
  "employee.update",
  "employee.reset_password",
  "employee.delete.blocked",
  "vehicle.read.list",
  "vehicle.read.detail",
  "vehicle.create",
  "vehicle.update",
  "vehicle.delete",
  "dashboard.read",
  "audit.read.list",
  "audit.read.detail",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// 動作 → 繁體中文標籤：與 AUDIT_ACTIONS 同源維護，前後端共用。
// 前端動作下拉與表格「動作」欄皆以此呈現；未涵蓋的動作字串 fallback 顯示原始字串。
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "auth.login.success": "登入成功",
  "auth.login.failure": "登入失敗",
  "auth.logout": "登出",
  "auth.session.read": "讀取登入狀態",
  "auth.register.blocked": "註冊被拒",
  "employee.read.list": "查看員工列表",
  "employee.read.detail": "查看員工詳情",
  "employee.create": "建立員工",
  "employee.update": "更新員工",
  "employee.reset_password": "重設員工密碼",
  "employee.delete.blocked": "刪除員工被拒",
  "vehicle.read.list": "查看車輛列表",
  "vehicle.read.detail": "查看車輛詳情",
  "vehicle.create": "建立車輛",
  "vehicle.update": "更新車輛",
  "vehicle.delete": "刪除車輛",
  "dashboard.read": "查看儀表板",
  "audit.read.list": "查看操作紀錄列表",
  "audit.read.detail": "查看操作紀錄詳情",
};

const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

// 將逗號分隔字串（或重複 query key 形成的陣列）正規化為去空白、去空值的字串陣列；
// 未提供（null/undefined）維持原值以讓 .default([]) 生效。
function toStringList(v: unknown): unknown {
  if (v == null) return v;
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .flatMap((x) => (typeof x === "string" ? x.split(",") : [x]))
    .map((x) => (typeof x === "string" ? x.trim() : x))
    .filter((x) => x !== "" && x != null);
}

// outcome 多值；"ALL"（或未提供）視為不限制，轉為空陣列。
function toOutcomeList(v: unknown): unknown {
  const list = toStringList(v);
  if (list == null) return list;
  if (Array.isArray(list) && list.includes("ALL")) return [];
  return list;
}

export const auditLogListQuerySchema = z.object({
  ...pageFields,
  // 比對 actorUsername（含部分字串）；後端以逗號切多關鍵字做 OR 比對。
  search: z.string().optional(),
  // 多值：每個元素可為具體 action（如 `employee.create`）或類別前綴（如 `employee`）；空陣列表示不限制。
  action: z.preprocess(toStringList, z.array(z.string().min(1)).default([])),
  // 多值：SUCCESS / FAILURE；空陣列（含傳入 `ALL` 或未提供）表示不限制。
  outcome: z.preprocess(toOutcomeList, z.array(z.enum(AUDIT_OUTCOMES)).default([])),
  // createdAt 日期區間（含端點）。
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;

// 對外輸出 (DTO)：時間以 ISO 字串呈現，metadata 為任意 JSON。
export interface AuditLogDTO {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorUsername: string | null;
  actorRole: Role | null;
  action: string;
  method: string;
  path: string;
  targetType: string | null;
  targetId: string | null;
  outcome: AuditOutcome;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  metadata: unknown;
}
