import request from "supertest";
import type { Application } from "express";
import type { AuditLog } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { flushAuditLogs } from "../services/audit-logger.js";

export async function loginAs(
  app: Application,
  username: string,
  password = "password123",
) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username, password });
  if (res.status !== 200) {
    throw new Error(
      `loginAs failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  const cookieHeader = res.headers["set-cookie"];
  const cookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
  return {
    cookies: cookies.filter(Boolean) as string[],
    csrf: res.body.csrfToken as string,
    user: res.body.user,
  };
}

export function withAuth(
  agent: request.Test,
  session: { cookies: string[]; csrf: string },
): request.Test {
  return agent
    .set("Cookie", session.cookies)
    .set("X-CSRF-Token", session.csrf);
}

// 稽核寫入是 res.on("finish") 後的 fire-and-forget；測試以此 poll 等待目標紀錄出現。
export async function waitForAuditLog(
  predicate: (a: AuditLog) => boolean,
  { timeoutMs = 3000, intervalMs = 25 } = {},
): Promise<AuditLog> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await flushAuditLogs();
    const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } });
    const found = rows.find(predicate);
    if (found) return found;
    if (Date.now() > deadline) {
      throw new Error(
        `waitForAuditLog 逾時；現有 actions=${JSON.stringify(rows.map((r) => r.action))}`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
