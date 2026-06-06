import { Router } from "express";
import { Prisma } from "@prisma/client";
import {
  createVehicleSchema,
  updateVehicleSchema,
  vehicleListQuerySchema,
} from "@vms/shared";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const vehiclesRouter: Router = Router();

vehiclesRouter.use(requireAuth);

vehiclesRouter.get("/", async (req, res) => {
  const q = vehicleListQuerySchema.parse(req.query);
  const where: Prisma.VehicleWhereInput = {};
  if (q.status !== "ALL") where.status = q.status;
  if (q.search) {
    where.OR = [
      { plate: { contains: q.search, mode: "insensitive" } },
      { make: { contains: q.search, mode: "insensitive" } },
      { model: { contains: q.search, mode: "insensitive" } },
    ];
  }
  if (req.user!.role === "USER") {
    where.ownerId = req.user!.employeeId;
  }
  const [total, rows] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { owner: { select: { name: true, employeeNo: true, status: true } } },
    }),
  ]);
  res.json({
    items: rows,
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  });
});

vehiclesRouter.get("/:id", async (req, res) => {
  const v = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
  if (!v) throw new HttpError(404, "VEHICLE_NOT_FOUND", "找不到該車輛");
  if (req.user!.role === "USER" && v.ownerId !== req.user!.employeeId) {
    throw new HttpError(404, "VEHICLE_NOT_FOUND", "找不到該車輛");
  }
  res.json(v);
});

async function assertActiveOwner(ownerId: string | null | undefined) {
  if (!ownerId) return;
  const owner = await prisma.employee.findUnique({ where: { id: ownerId } });
  if (!owner || owner.status !== "ACTIVE") {
    throw new HttpError(400, "INVALID_OWNER", "ownerId 必須是在職員工");
  }
}

vehiclesRouter.post("/", requireAdmin, async (req, res) => {
  const data = createVehicleSchema.parse(req.body);
  await assertActiveOwner(data.ownerId ?? null);
  try {
    const created = await prisma.vehicle.create({ data });
    res.status(201).json(created);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new HttpError(409, "VEHICLE_PLATE_CONFLICT", "車牌已存在");
    }
    throw err;
  }
});

vehiclesRouter.patch("/:id", requireAdmin, async (req, res) => {
  const data = updateVehicleSchema.parse(req.body);
  if ("ownerId" in data) await assertActiveOwner(data.ownerId ?? null);
  try {
    const updated = await prisma.vehicle.update({
      where: { id: req.params.id },
      data,
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        throw new HttpError(404, "VEHICLE_NOT_FOUND", "找不到該車輛");
      }
      if (err.code === "P2002") {
        throw new HttpError(409, "VEHICLE_PLATE_CONFLICT", "車牌已存在");
      }
    }
    throw err;
  }
});

vehiclesRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await prisma.vehicle.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new HttpError(404, "VEHICLE_NOT_FOUND", "找不到該車輛");
    }
    throw err;
  }
});
