import { prisma } from "../db/prisma.js";

export async function resetDb() {
  // AuditLog 無 FK 關聯，先清理避免跨測試殘留干擾筆數斷言。
  await prisma.auditLog.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.employee.deleteMany();
}

export async function disconnect() {
  await prisma.$disconnect();
}
