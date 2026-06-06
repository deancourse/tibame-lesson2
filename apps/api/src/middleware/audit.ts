import type { Request, Response, NextFunction } from "express";
import type { AuditOutcome, Role } from "@vms/shared";
import { deriveAction, deriveTarget, record } from "../services/audit-logger.js";

interface AuditActor {
  id: string;
  username: string;
  role: Role;
}

// key 名稱含這些字樣（不分大小寫）的欄位，其值會被遮蔽，避免敏感資料寫入稽核紀錄。
const SENSITIVE_KEY = /(password|token|secret|authorization|csrf)/i;
// 參數快照序列化後的大小上限，超過則以摘要取代，避免單筆 metadata 過大。
const PARAMS_MAX_CHARS = 4000;

// 遞迴遮蔽敏感欄位；限制深度避免極端巢狀造成爆量。
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

function hasKeys(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && Object.keys(v as object).length > 0;
}

// 合併 route params / query / body 為參數快照並遮蔽；超過大小上限則以摘要取代。
function buildParams(routeParams: unknown, query: unknown, body: unknown): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (hasKeys(routeParams)) params.params = sanitize(routeParams);
  if (hasKeys(query)) params.query = sanitize(query);
  if (hasKeys(body)) params.body = sanitize(body);
  try {
    const s = JSON.stringify(params);
    if (s.length > PARAMS_MAX_CHARS) return { _truncated: true, size: s.length };
  } catch {
    return { _unserializable: true };
  }
  return params;
}

// 在每個 /api/* 請求 response 結束時寫入一筆稽核紀錄（/api/health 除外）。
// 採 res.on("finish") 以取得最終狀態碼（含被 errorHandler 改寫後的 4xx/5xx），
// 並以 fire-and-forget 方式呼叫 record（best-effort，見 design.md D1/D5）。
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/api/health") return next();

  // 在進入點擷取 method/path/ip/UA：router 掛載會在處理過程中改寫 req.url/req.path，
  // res.on("finish") 時讀到的可能已非原始完整路徑。
  const method = req.method;
  const path = req.path;
  const ip = req.ip ?? null;
  const userAgent = req.get("user-agent") ?? null;
  // query/body 於進入點擷取（已經過 express.json 解析）；route params 於 finish 時讀（route 已比對）。
  const query = req.query;
  const body = req.body;

  res.on("finish", () => {
    const statusCode = res.statusCode;
    const outcome: AuditOutcome = statusCode < 400 ? "SUCCESS" : "FAILURE";
    const action = deriveAction(method, path, outcome);
    const { targetType, targetId } = deriveTarget(path);

    // actor 來源優先序：handler 設定的 res.locals.auditActor → requireAuth 的 req.user → 匿名。
    const localsActor = res.locals.auditActor as AuditActor | undefined;
    const localsUsername = res.locals.auditUsername as string | undefined;
    const actorId = localsActor?.id ?? req.user?.id ?? null;
    const actorUsername =
      localsActor?.username ?? localsUsername ?? req.user?.username ?? null;
    const actorRole = localsActor?.role ?? req.user?.role ?? null;

    // 參數快照（遮蔽敏感欄位）與既有 handler 設定的 auditMeta（如登入失敗 reason）合併保留。
    const params = buildParams(req.params, query, body);
    const existing = res.locals.auditMeta;
    const metadata =
      existing && typeof existing === "object"
        ? { ...(existing as Record<string, unknown>), params }
        : existing != null
          ? { value: existing, params }
          : { params };

    void record({
      actorId,
      actorUsername,
      actorRole,
      action,
      method,
      path,
      targetType,
      targetId,
      outcome,
      statusCode,
      ip,
      userAgent,
      metadata,
    });
  });

  next();
}
