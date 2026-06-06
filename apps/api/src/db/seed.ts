import "../lib/loadDotenv.js";
import bcrypt from "bcrypt";
import { prisma } from "./prisma.js";

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD 未設定");
  }

  const existing = await prisma.employee.findUnique({ where: { username } });
  if (existing) {
    console.log(`seed: admin '${username}' 已存在，跳過`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.employee.create({
    data: {
      employeeNo: "ADMIN-0001",
      name: "系統管理員",
      email: `${username}@vms.local`,
      department: "資訊",
      position: "系統管理員",
      hiredAt: new Date(),
      phone: "0000-000-000",
      status: "ACTIVE",
      username,
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`seed: 已建立 admin '${username}'`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
