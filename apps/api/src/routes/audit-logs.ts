import { Router } from "express";
import { Prisma } from "@prisma/client";
import { AUDIT_ACTION_CATEGORIES, auditLogListQuerySchema } from "@vms/shared";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { serializeAuditLog } from "../services/audit-serializer.js";

export const auditLogsRouter: Router = Router();

// 稽核紀錄唯讀，且僅限 admin 查閱。
auditLogsRouter.use(requireAuth, requireAdmin);

auditLogsRouter.get("/", async (req, res) => {
  const q = auditLogListQuerySchema.parse(req.query);

  // 各篩選維度各自組成一個子條件，彼此以 AND 結合；維度內的多值以 OR 結合
  // （Prisma 同層只能有一個 OR，故用 AND 包多組 OR）。
  const and: Prisma.AuditLogWhereInput[] = [];

  // 結果（多值）：空陣列表示不限制。
  if (q.outcome.length > 0) and.push({ outcome: { in: q.outcome } });

  // 操作者（多關鍵字）：以逗號切，任一命中即納入（OR contains）。
  if (q.search) {
    const keywords = q.search
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (keywords.length > 0) {
      and.push({
        OR: keywords.map(
          (k): Prisma.AuditLogWhereInput => ({
            actorUsername: { contains: k, mode: "insensitive" },
          }),
        ),
      });
    }
  }

  // 動作（多值）：類別前綴（如 `employee`）→ startsWith `employee.`；否則視為具體 action。
  if (q.action.length > 0) {
    and.push({
      OR: q.action.map(
        (a): Prisma.AuditLogWhereInput =>
          (AUDIT_ACTION_CATEGORIES as readonly string[]).includes(a)
            ? { action: { startsWith: `${a}.` } }
            : { action: a },
      ),
    });
  }

  // createdAt 日期區間（含端點）。
  if (q.from || q.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (q.from) createdAt.gte = q.from;
    if (q.to) createdAt.lte = q.to;
    and.push({ createdAt });
  }

  const where: Prisma.AuditLogWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  res.json({
    items: rows.map(serializeAuditLog),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  });
});

auditLogsRouter.get("/:id", async (req, res) => {
  const a = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
  if (!a) throw new HttpError(404, "AUDIT_LOG_NOT_FOUND", "找不到該稽核紀錄");
  res.json(serializeAuditLog(a));
});
