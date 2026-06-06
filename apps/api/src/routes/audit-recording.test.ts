import { jest } from "@jest/globals";
import request from "supertest";
import { buildApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { disconnect, resetDb } from "../test/setup.js";
import { makeEmployee, makeVehicle } from "../test/factories.js";
import { flushAuditLogs } from "../services/audit-logger.js";
import { loginAs, waitForAuditLog, withAuth } from "../test/helpers.js";

const app = buildApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnect();
});

describe("audit recording — auth events", () => {
  test("successful login -> auth.login.success with actor", async () => {
    const admin = await makeEmployee({ role: "ADMIN", username: "admin1" });
    await loginAs(app, "admin1");
    const rec = await waitForAuditLog((a) => a.action === "auth.login.success");
    expect(rec.outcome).toBe("SUCCESS");
    expect(rec.actorId).toBe(admin.id);
    expect(rec.actorUsername).toBe("admin1");
    expect(rec.actorRole).toBe("ADMIN");
  });

  test("failed login -> auth.login.failure without actorId, with reason", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin1", password: "wrong-password" });
    expect(res.status).toBe(401);
    const rec = await waitForAuditLog((a) => a.action === "auth.login.failure");
    expect(rec.outcome).toBe("FAILURE");
    expect(rec.actorId).toBeNull();
    expect(rec.actorUsername).toBe("admin1");
    expect(rec.metadata).toMatchObject({ reason: "INVALID_CREDENTIALS" });
  });

  test("logout -> auth.logout", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const session = await loginAs(app, "admin1");
    const res = await withAuth(request(app).post("/api/auth/logout"), session);
    expect(res.status).toBe(204);
    const rec = await waitForAuditLog((a) => a.action === "auth.logout");
    expect(rec.actorId).not.toBeNull();
  });
});

describe("audit recording — data mutations", () => {
  test("POST /api/employees -> employee.create", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const session = await loginAs(app, "admin1");
    const res = await withAuth(request(app).post("/api/employees"), session).send({
      employeeNo: "E-9001",
      name: "新人",
      email: "new@vms.local",
      department: "工務",
      position: "工程師",
      hiredAt: "2024-01-01",
      phone: "0900-000-001",
      username: "newbie",
      initialPassword: "password123",
      role: "USER",
    });
    expect(res.status).toBe(201);
    const rec = await waitForAuditLog((a) => a.action === "employee.create");
    expect(rec.outcome).toBe("SUCCESS");
    expect(rec.targetType).toBe("employee");
  });

  test("PATCH /api/vehicles/:id -> vehicle.update with targetId", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const car = await makeVehicle();
    const session = await loginAs(app, "admin1");
    const res = await withAuth(
      request(app).patch(`/api/vehicles/${car.id}`),
      session,
    ).send({ mileage: 2000 });
    expect(res.status).toBe(200);
    const rec = await waitForAuditLog(
      (a) => a.action === "vehicle.update" && a.targetId === car.id,
    );
    expect(rec.targetType).toBe("vehicle");
  });

  test("DELETE /api/employees/:id -> employee.delete.blocked (405)", async () => {
    const admin = await makeEmployee({ role: "ADMIN", username: "admin1" });
    const session = await loginAs(app, "admin1");
    const res = await withAuth(
      request(app).delete(`/api/employees/${admin.id}`),
      session,
    );
    expect(res.status).toBe(405);
    const rec = await waitForAuditLog((a) => a.action === "employee.delete.blocked");
    expect(rec.outcome).toBe("FAILURE");
    expect(rec.statusCode).toBe(405);
  });
});

describe("audit recording — sensitive reads", () => {
  test("GET /api/vehicles -> vehicle.read.list (captures actor via req.user)", async () => {
    const admin = await makeEmployee({ role: "ADMIN", username: "admin1" });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get("/api/vehicles")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    const rec = await waitForAuditLog((a) => a.action === "vehicle.read.list");
    expect(rec.outcome).toBe("SUCCESS");
    // 非登入路徑（無 res.locals.auditActor）也須從 req.user 帶出完整 actor 快照。
    expect(rec.actorId).toBe(admin.id);
    expect(rec.actorUsername).toBe("admin1");
    expect(rec.actorRole).toBe("ADMIN");
  });

  test("GET /api/employees/:id -> employee.read.detail with targetId", async () => {
    const admin = await makeEmployee({ role: "ADMIN", username: "admin1" });
    const target = await makeEmployee({ role: "USER", username: "user1" });
    const session = await loginAs(app, "admin1");
    const res = await request(app)
      .get(`/api/employees/${target.id}`)
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    const rec = await waitForAuditLog(
      (a) => a.action === "employee.read.detail" && a.targetId === target.id,
    );
    expect(rec.targetType).toBe("employee");
    void admin;
  });

  test("GET /api/health is NOT recorded", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    await flushAuditLogs();
    await new Promise((r) => setTimeout(r, 100));
    await flushAuditLogs();
    const count = await prisma.auditLog.count({ where: { path: "/api/health" } });
    expect(count).toBe(0);
  });
});

describe("audit recording — request parameters", () => {
  test("PATCH /api/vehicles/:id captures route param and body in metadata.params", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const car = await makeVehicle();
    const session = await loginAs(app, "admin1");
    const res = await withAuth(
      request(app).patch(`/api/vehicles/${car.id}`),
      session,
    ).send({ mileage: 2000 });
    expect(res.status).toBe(200);
    const rec = await waitForAuditLog(
      (a) => a.action === "vehicle.update" && a.targetId === car.id,
    );
    const md = rec.metadata as {
      params?: { params?: Record<string, unknown>; body?: Record<string, unknown> };
    };
    expect(md.params?.params?.id).toBe(car.id);
    expect(md.params?.body?.mileage).toBe(2000);
  });

  test("password fields are redacted in metadata", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin1", password: "wrong-password" });
    expect(res.status).toBe(401);
    const rec = await waitForAuditLog((a) => a.action === "auth.login.failure");
    const md = rec.metadata as {
      reason?: string;
      params?: { body?: Record<string, unknown> };
    };
    expect(md.params?.body?.password).toBe("[REDACTED]");
    expect(md.params?.body?.username).toBe("admin1");
    // 既有 handler 設定的 reason 仍與參數快照合併保留。
    expect(md.reason).toBe("INVALID_CREDENTIALS");
    // 確保明文密碼未出現在序列化後的 metadata 中。
    expect(JSON.stringify(rec.metadata)).not.toContain("wrong-password");
  });
});

describe("audit recording — best-effort", () => {
  test("audit write failure does not affect main request", async () => {
    await makeEmployee({ role: "ADMIN", username: "admin1" });
    const session = await loginAs(app, "admin1");

    const spy = jest
      .spyOn(prisma.auditLog, "create")
      .mockRejectedValue(new Error("boom"));
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app)
      .get("/api/vehicles")
      .set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);

    await flushAuditLogs();
    expect(errSpy).toHaveBeenCalled();

    spy.mockRestore();
    errSpy.mockRestore();
  });
});
