import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Role } from "@vms/shared";
import { env } from "./env.js";

export interface JwtPayload {
  sub: string;
  role: Role;
  employeeId: string;
  username: string;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export type VerifyResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; reason: "expired" | "invalid" };

export function verifyJwt(token: string): VerifyResult {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload;
    return { ok: true, payload: decoded };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "invalid" };
  }
}
