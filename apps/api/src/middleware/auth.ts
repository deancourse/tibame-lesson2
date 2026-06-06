import type { Request, Response, NextFunction } from "express";
import type { Role } from "@vms/shared";
import { verifyJwt } from "../lib/jwt.js";
import { csrfMatches } from "../lib/csrf.js";
import { HttpError } from "../lib/http-error.js";
import { AUTH_COOKIE } from "../lib/cookies.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      role: Role;
      employeeId: string;
      username: string;
      token: string;
    };
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw new HttpError(401, "UNAUTHENTICATED", "未登入");
  const result = verifyJwt(token);
  if (!result.ok) {
    if (result.reason === "expired") {
      throw new HttpError(401, "TOKEN_EXPIRED", "token 已過期");
    }
    throw new HttpError(401, "TOKEN_INVALID", "token 不合法");
  }
  req.user = {
    id: result.payload.sub,
    role: result.payload.role,
    employeeId: result.payload.employeeId,
    username: result.payload.username,
    token,
  };
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    throw new HttpError(403, "FORBIDDEN", "需要管理員權限");
  }
  next();
}

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (!MUTATING.has(req.method)) return next();
  if (req.path === "/api/auth/login") return next();
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return next();
  const provided = req.header("X-CSRF-Token");
  if (!provided) {
    throw new HttpError(403, "CSRF_TOKEN_MISSING", "缺少 CSRF token");
  }
  if (!csrfMatches(token, provided)) {
    throw new HttpError(403, "CSRF_TOKEN_INVALID", "CSRF token 不正確");
  }
  next();
}
