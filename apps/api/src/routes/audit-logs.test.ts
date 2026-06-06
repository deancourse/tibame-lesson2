import request from "supertest";
import { buildApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { disconnect, resetDb } from "../test/setup.js";
import { makeEmployee } from "../test/factories.js";
import { loginAs } from "../test/helpers.js";

const app = buildApp();

async function makeAuditLog(
  overrides: Partial<{
    action: string;
    method: string;
    path: string;
    outcome: "SUCCESS" | "FAILURE";
    statusCode: number;
    actorUsername: string | null;
    actorId: string | null;
    targetType: string | null;
    targetId: string | null;
    createdAt: Date;
    metadata: unknown;
  }> = {},
) {
  return prisma.auditLog.create({
    data: {
      action: overrides.action ?? "vehicle.read.list",
      method: overrides.method ?? "GET",
      path: overrides.path ?? "/api/vehicles",
      outcome: overrides.outcome ?? "SUCCESS",
      statusCode: overrides.statusCode ?? 200,
      actorUsername: overrides.actorUsername ?? "admin1",
      actorId: overrides.actorId ?? null,
      actorRole: "ADMIN",
      targetType: overrides.targetType ?? null,
      targetId: overrides.targetId ?? null,
      ip: "127.0.0.1",
      userAgent: "jest",
      createdAt: overrides.createdAt ?? new Date(),
      metadata:
        overrides.metadata === undefined ? undefined : (overrides.metadata as object),
    },
  });
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnect();
});

describe("audit-logs query API", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).get("/api/audit-logs");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  test("user -> 403", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    await makeEmployee({ role: "USER", username: "user1" });
    const session = await loginAs(app, "user1");
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  test("admin default pagination shape", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    await makeAuditLog();
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.totalPages).toBeGreaterThanOrEqual(1);
  });

  test("filter by outcome=FAILURE returns only failures", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    await makeAuditLog({ action: "vehicle.read.list", outcome: "SUCCESS", statusCode: 200 });
    await makeAuditLog({ action: "auth.login.failure", outcome: "FAILURE", statusCode: 401 });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs?outcome=FAILURE")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.outcome).toBe("FAILURE");
    }
  });

  test("filter by search + date range", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    await makeAuditLog({
      actorUsername: "alice",
      createdAt: new Date("2026-01-15T00:00:00.000Z"),
    });
    await makeAuditLog({
      actorUsername: "bob",
      createdAt: new Date("2026-01-15T00:00:00.000Z"),
    });
    await makeAuditLog({
      actorUsername: "alice",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs?search=alice&from=2026-01-01&to=2026-02-01")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.actorUsername).toBe("alice");
      const t = new Date(item.createdAt).getTime();
      expect(t).toBeGreaterThanOrEqual(new Date("2026-01-01").getTime());
      expect(t).toBeLessThanOrEqual(new Date("2026-02-01").getTime());
    }
  });

  test("filter by action category prefix", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    await makeAuditLog({ action: "employee.create", outcome: "SUCCESS" });
    await makeAuditLog({ action: "vehicle.update", outcome: "SUCCESS" });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs?action=employee")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.action.startsWith("employee.")).toBe(true);
    }
  });

  test("filter by multiple specific actions (comma-separated)", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    await makeAuditLog({ action: "auth.login.success", outcome: "SUCCESS" });
    await makeAuditLog({ action: "vehicle.update", outcome: "SUCCESS" });
    await makeAuditLog({ action: "employee.create", outcome: "SUCCESS" });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs?action=auth.login.success,vehicle.update")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    for (const item of res.body.items) {
      expect(["auth.login.success", "vehicle.update"]).toContain(item.action);
    }
    const actions = res.body.items.map((i: { action: string }) => i.action);
    expect(actions).not.toContain("employee.create");
  });

  test("filter by multiple actor keywords (comma-separated)", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    await makeAuditLog({ actorUsername: "alice" });
    await makeAuditLog({ actorUsername: "bob" });
    await makeAuditLog({ actorUsername: "carol" });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs?search=alice,bob")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    const names = res.body.items.map((i: { actorUsername: string }) => i.actorUsername);
    expect(names).toEqual(expect.arrayContaining(["alice", "bob"]));
    expect(names).not.toContain("carol");
  });

  test("accepts multiple outcome values without validation error", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    await makeAuditLog({ action: "vehicle.read.list", outcome: "SUCCESS", statusCode: 200 });
    await makeAuditLog({ action: "auth.login.failure", outcome: "FAILURE", statusCode: 401 });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs?outcome=SUCCESS,FAILURE")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    for (const item of res.body.items) {
      expect(["SUCCESS", "FAILURE"]).toContain(item.outcome);
    }
  });

  test("invalid outcome value -> 400", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs?outcome=BOGUS")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("invalid pageSize -> 400", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs?pageSize=999")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("GET /:id existing -> 200 with metadata", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const row = await makeAuditLog({
      action: "auth.login.failure",
      outcome: "FAILURE",
      statusCode: 401,
      metadata: { reason: "INVALID_CREDENTIALS" },
    });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get(`/api/audit-logs/${row.id}`)
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(row.id);
    expect(res.body.metadata).toEqual({ reason: "INVALID_CREDENTIALS" });
  });

  test("GET /:id missing -> 404", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/audit-logs/00000000-0000-0000-0000-000000000000")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("AUDIT_LOG_NOT_FOUND");
  });
});
