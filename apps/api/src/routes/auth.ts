import { Router } from "express";
import bcrypt from "bcrypt";
import { loginSchema } from "@vms/shared";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { signJwt } from "../lib/jwt.js";
import { deriveCsrf } from "../lib/csrf.js";
import { clearAuthCookie, setAuthCookie } from "../lib/cookies.js";
import { requireAuth } from "../middleware/auth.js";
import { publicEmployee } from "../services/employee-serializer.js";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

export const authRouter: Router = Router();

authRouter.post("/register", (_req, _res) => {
  throw new HttpError(404, "NOT_FOUND", "未提供註冊功能");
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  // 供 auditMiddleware 記錄登入失敗時的帳號（actorId 維持 null）。
  res.locals.auditUsername = username;
  const employee = await prisma.employee.findUnique({ where: { username } });
  if (!employee) {
    res.locals.auditMeta = { reason: "INVALID_CREDENTIALS" };
    throw new HttpError(401, "INVALID_CREDENTIALS", "帳號或密碼錯誤");
  }
  const now = new Date();
  if (employee.lockedUntil && employee.lockedUntil > now) {
    res.locals.auditMeta = { reason: "ACCOUNT_LOCKED" };
    throw new HttpError(401, "ACCOUNT_LOCKED", "帳號已暫時鎖定", {
      unlockAt: employee.lockedUntil.toISOString(),
    });
  }
  if (employee.status === "INACTIVE") {
    res.locals.auditMeta = { reason: "ACCOUNT_INACTIVE" };
    throw new HttpError(401, "ACCOUNT_INACTIVE", "帳號已停用");
  }
  const ok = await bcrypt.compare(password, employee.passwordHash);
  if (!ok) {
    const nextCount = employee.failedLoginCount + 1;
    const lockedUntil =
      nextCount >= MAX_FAILED ? new Date(now.getTime() + LOCK_MS) : employee.lockedUntil;
    await prisma.employee.update({
      where: { id: employee.id },
      data: { failedLoginCount: nextCount, lockedUntil },
    });
    res.locals.auditMeta = { reason: "INVALID_CREDENTIALS" };
    throw new HttpError(401, "INVALID_CREDENTIALS", "帳號或密碼錯誤");
  }
  if (employee.failedLoginCount !== 0 || employee.lockedUntil) {
    await prisma.employee.update({
      where: { id: employee.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
  const token = signJwt({
    sub: employee.id,
    role: employee.role,
    employeeId: employee.id,
    username: employee.username,
  });
  setAuthCookie(res, token);
  // 登入成功：供 auditMiddleware 記錄操作者快照（auth.login.success）。
  res.locals.auditActor = {
    id: employee.id,
    username: employee.username,
    role: employee.role,
  };
  res.json({
    user: {
      id: employee.id,
      name: employee.name,
      role: employee.role,
      employeeId: employee.id,
      email: employee.email,
    },
    csrfToken: deriveCsrf(token),
  });
});

authRouter.post("/logout", requireAuth, (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const employee = await prisma.employee.findUnique({ where: { id: req.user!.id } });
  if (!employee) throw new HttpError(401, "UNAUTHENTICATED", "使用者已不存在");
  const pub = publicEmployee(employee);
  res.json({
    user: {
      id: pub.id,
      name: pub.name,
      role: pub.role,
      employeeId: pub.id,
      email: pub.email,
    },
    csrfToken: deriveCsrf(req.user!.token),
  });
});
