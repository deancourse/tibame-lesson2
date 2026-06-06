import type { AuditLog } from "@prisma/client";
import type { AuditLogDTO } from "@vms/shared";

export function serializeAuditLog(a: AuditLog): AuditLogDTO {
  return {
    id: a.id,
    createdAt: a.createdAt.toISOString(),
    actorId: a.actorId,
    actorUsername: a.actorUsername,
    actorRole: a.actorRole,
    action: a.action,
    method: a.method,
    path: a.path,
    targetType: a.targetType,
    targetId: a.targetId,
    outcome: a.outcome,
    statusCode: a.statusCode,
    ip: a.ip,
    userAgent: a.userAgent,
    metadata: a.metadata ?? null,
  };
}
