import express from "express";
import "express-async-errors";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env } from "./lib/env.js";
import { csrfGuard } from "./middleware/auth.js";
import { auditMiddleware } from "./middleware/audit.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { employeesRouter, employeesMethodOverride } from "./routes/employees.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { auditLogsRouter } from "./routes/audit-logs.js";

export function buildApp() {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser(env.COOKIE_SECRET));
  if (env.NODE_ENV !== "test") {
    app.use(pinoHttp({ transport: { target: "pino-pretty" } }));
  }

  // auditMiddleware must be registered BEFORE employeesMethodOverride so that the
  // blocked DELETE /api/employees/:id (405) is still recorded as an audit event.
  app.use(auditMiddleware);

  // employeesMethodOverride must be registered BEFORE csrfGuard so that DELETE
  // /api/employees/:id returns 405 (per spec) rather than being blocked by CSRF.
  app.use(employeesMethodOverride);
  app.use(csrfGuard);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/employees", employeesRouter);
  app.use("/api/vehicles", vehiclesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/audit-logs", auditLogsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
