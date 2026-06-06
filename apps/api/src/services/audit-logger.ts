import { Prisma } from "@prisma/client";
import type { AuditOutcome } from "@vms/shared";
import type { Role } from "@vms/shared";
import { prisma } from "../db/prisma.js";

export interface AuditEntry {
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

// 把 `/api/employees/123` 拆成 ["employees", "123"]。
function segments(path: string): string[] {
  const clean = (path.split("?")[0] ?? "")
    .replace(/^\/api\/?/, "")
    .replace(/\/+$/, "");
  return clean.length ? clean.split("/") : [];
}

const RESOURCE_TARGET_TYPE: Record<string, string> = {
  employees: "employee",
  vehicles: "vehicle",
  "audit-logs": "audit_log",
};

// 由路由 path param 推導 targetType / targetId（建立操作通常無 id → null）。
export function deriveTarget(path: string): {
  targetType: string | null;
  targetId: string | null;
} {
  const segs = segments(path);
  const resource = segs[0] ?? "";
  const targetType = RESOURCE_TARGET_TYPE[resource] ?? null;
  if (!targetType) return { targetType: null, targetId: null };
  const id = segs[1] && segs[1] !== "" ? segs[1] : null;
  return { targetType, targetId: id };
}

// 由 method + 路由 + outcome 推導語意化 action；比對不到退回 `${resource}.${method}`。
export function deriveAction(
  method: string,
  path: string,
  outcome: AuditOutcome,
): string {
  const segs = segments(path);
  const resource = segs[0] ?? "";
  const hasId = segs.length >= 2;
  const m = method.toUpperCase();

  switch (resource) {
    case "auth": {
      const sub = segs[1];
      if (sub === "login") {
        return outcome === "SUCCESS" ? "auth.login.success" : "auth.login.failure";
      }
      if (sub === "logout") return "auth.logout";
      if (sub === "me") return "auth.session.read";
      if (sub === "register") return "auth.register.blocked";
      return `auth.${sub ?? m.toLowerCase()}`;
    }
    case "employees": {
      if (m === "GET") return hasId ? "employee.read.detail" : "employee.read.list";
      if (m === "POST") {
        if (segs[2] === "reset-password") return "employee.reset_password";
        return "employee.create";
      }
      if (m === "PATCH") return "employee.update";
      if (m === "DELETE") return "employee.delete.blocked";
      return `employee.${m.toLowerCase()}`;
    }
    case "vehicles": {
      if (m === "GET") return hasId ? "vehicle.read.detail" : "vehicle.read.list";
      if (m === "POST") return "vehicle.create";
      if (m === "PATCH") return "vehicle.update";
      if (m === "DELETE") return "vehicle.delete";
      return `vehicle.${m.toLowerCase()}`;
    }
    case "dashboard":
      return "dashboard.read";
    case "audit-logs":
      return hasId ? "audit.read.detail" : "audit.read.list";
    default:
      return `${resource || "unknown"}.${m.toLowerCase()}`;
  }
}

// 追蹤未完成的寫入，供測試以 flushAuditLogs() 等待（見 design.md D5）。
const pending = new Set<Promise<void>>();

// best-effort 寫入：失敗只記 server log，絕不丟回呼叫端、不阻斷主請求。
export function record(entry: AuditEntry): Promise<void> {
  const p = (async () => {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          actorUsername: entry.actorUsername,
          actorRole: entry.actorRole,
          action: entry.action,
          method: entry.method,
          path: entry.path,
          targetType: entry.targetType,
          targetId: entry.targetId,
          outcome: entry.outcome,
          statusCode: entry.statusCode,
          ip: entry.ip,
          userAgent: entry.userAgent,
          metadata:
            entry.metadata == null
              ? Prisma.JsonNull
              : (entry.metadata as Prisma.InputJsonValue),
        },
      });
    } catch (err) {
      console.error("[audit] 寫入稽核紀錄失敗", err);
    }
  })();
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
}

// 測試用：等待所有在途的稽核寫入完成。
export async function flushAuditLogs(): Promise<void> {
  await Promise.all([...pending]);
}
