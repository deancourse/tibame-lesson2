import "../lib/loadDotenv.js";
import bcrypt from "bcrypt";
import {
  DEPARTMENTS,
  POSITIONS,
  VEHICLE_COLORS,
  VEHICLE_MAKES,
} from "@vms/shared";
import { prisma } from "./prisma.js";

const MOCK_PASSWORD = "password1234";
const EMPLOYEE_COUNT = 30;
const VEHICLE_COUNT = 50;
const EXTRA_ADMIN_COUNT = 2;
const INACTIVE_COUNT = 4;
const VEHICLES_WITHOUT_OWNER = 10;
const STATUS_BUCKETS: Array<["AVAILABLE" | "MAINTENANCE" | "RETIRED", number]> = [
  ["AVAILABLE", 35],
  ["MAINTENANCE", 10],
  ["RETIRED", 5],
];

const SURNAMES = [
  "陳", "林", "黃", "張", "李", "王", "吳", "劉", "蔡", "楊",
  "許", "鄭", "謝", "郭", "洪", "邱", "曾", "廖", "賴", "周",
];
const GIVEN_NAMES = [
  "志明", "怡君", "宗翰", "美玲", "建宏", "雅婷", "俊豪", "淑芬", "家瑋", "佳穎",
  "冠廷", "心怡", "彥廷", "婉婷", "柏翰", "詩涵", "致遠", "曉君", "宥廷", "韻如",
  "瑞祥", "玉婷", "明哲", "靜怡", "啟賢", "佩珊", "弘毅", "莉婷", "宏儒", "亞蓁",
];

const VEHICLE_MODELS_BY_MAKE: Record<string, string[]> = {
  Toyota: ["Corolla", "Camry", "RAV4", "Yaris", "Sienta"],
  Honda: ["Civic", "Fit", "HR-V", "CR-V", "Odyssey"],
  Nissan: ["Sentra", "Tiida", "Kicks", "X-Trail", "Livina"],
  Mazda: ["Mazda3", "Mazda6", "CX-5", "CX-30", "MX-5"],
  Ford: ["Focus", "Kuga", "Ranger", "Fiesta", "Mondeo"],
  Hyundai: ["Elantra", "Tucson", "Santa Fe", "Venue", "Custin"],
  BMW: ["320i", "X1", "X3", "520i", "i4"],
  "Mercedes-Benz": ["A180", "C200", "E300", "GLA", "GLC"],
  Tesla: ["Model 3", "Model Y", "Model S", "Model X"],
  Lexus: ["ES300h", "RX350", "NX200", "UX250h", "IS300"],
};

const PLATE_LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomInt(min: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
}

function randomDateInPast12Months(): Date {
  const now = Date.now();
  const past = now - 365 * 24 * 60 * 60 * 1000;
  return new Date(randomInt(past, now));
}

function randomDateForMonthOffset(monthsAgo: number): Date {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setMonth(base.getMonth() - monthsAgo);
  const dayOfMonth = randomInt(1, 27);
  base.setDate(dayOfMonth);
  return base;
}

function randomPlate(used: Set<string>): string {
  while (true) {
    const letters = Array.from({ length: 3 }, () => pick(PLATE_LETTERS.split(""))).join("");
    const digits = String(randomInt(0, 9999)).padStart(4, "0");
    const plate = `${letters}-${digits}`;
    if (!used.has(plate)) {
      used.add(plate);
      return plate;
    }
  }
}

function uniqueValue<T>(used: Set<string>, build: () => T, key: (v: T) => string): T {
  while (true) {
    const v = build();
    const k = key(v);
    if (!used.has(k)) {
      used.add(k);
      return v;
    }
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    yes: argv.includes("--yes") || process.env.SEED_MOCK_CONFIRM === "1",
  };
}

async function main() {
  const { yes } = parseArgs();
  if (!yes && process.env.NODE_ENV !== "development") {
    throw new Error(
      "seed:mock 為破壞性操作。請傳入 --yes 或設定 NODE_ENV=development 後再執行。",
    );
  }

  // 冪等清理：只保留正式的 seed admin（由 SEED_ADMIN_USERNAME 指定，後備為
  // employeeNo "ADMIN-0001"），其餘（含前一次 mock 產生的額外 admin）全部刪除，
  // 避免重複執行時 admin 數不斷累積。
  const seedAdminUsername = process.env.SEED_ADMIN_USERNAME;
  const keepWhere = seedAdminUsername
    ? { username: seedAdminUsername }
    : { employeeNo: "ADMIN-0001" };

  console.log("seed:mock: 開始清理（保留正式 seed admin、刪除其餘員工與全部車輛）…");
  await prisma.vehicle.deleteMany({});
  const deletedEmployees = await prisma.employee.deleteMany({
    where: { NOT: keepWhere },
  });
  console.log(`seed:mock: 已刪除 ${deletedEmployees.count} 名員工、所有車輛`);

  const passwordHash = await bcrypt.hash(MOCK_PASSWORD, 10);
  const usedUsernames = new Set<string>();
  const usedEmails = new Set<string>();
  const usedEmployeeNos = new Set<string>();
  (await prisma.employee.findMany({ select: { username: true, email: true, employeeNo: true } })).forEach((e) => {
    usedUsernames.add(e.username);
    usedEmails.add(e.email);
    usedEmployeeNos.add(e.employeeNo);
  });

  const createdEmployees: {
    id: string;
    role: "ADMIN" | "USER";
    status: "ACTIVE" | "INACTIVE";
  }[] = [];

  for (let i = 0; i < EMPLOYEE_COUNT; i += 1) {
    const surname = pick(SURNAMES);
    const given = pick(GIVEN_NAMES);
    const name = `${surname}${given}`;

    const username = uniqueValue(
      usedUsernames,
      () => `user${randomInt(100, 9999)}`,
      (v) => v,
    );
    const email = uniqueValue(
      usedEmails,
      () => `${username}@vms.local`,
      (v) => v,
    );
    const employeeNo = uniqueValue(
      usedEmployeeNos,
      () => `E-${String(randomInt(1000, 9999))}`,
      (v) => v,
    );

    const isExtraAdmin = i < EXTRA_ADMIN_COUNT;
    const isInactive = !isExtraAdmin && i < EXTRA_ADMIN_COUNT + INACTIVE_COUNT;

    const created = await prisma.employee.create({
      data: {
        employeeNo,
        name,
        email,
        department: pick(DEPARTMENTS),
        position: pick(POSITIONS.filter((p) => p !== "系統管理員")),
        hiredAt: new Date(
          Date.UTC(randomInt(2018, 2025), randomInt(0, 11), randomInt(1, 27)),
        ),
        phone: `09${randomInt(10, 99)}-${String(randomInt(0, 999)).padStart(3, "0")}-${String(randomInt(0, 999)).padStart(3, "0")}`,
        status: isInactive ? "INACTIVE" : "ACTIVE",
        username,
        passwordHash,
        role: isExtraAdmin ? "ADMIN" : "USER",
      },
    });
    createdEmployees.push({
      id: created.id,
      role: created.role as "ADMIN" | "USER",
      status: created.status as "ACTIVE" | "INACTIVE",
    });
  }

  // 只把 ACTIVE 的一般員工列為可指派 owner，與 API 的 assertActiveOwner 不變式一致
  // （vehicles.ts 對非 ACTIVE owner 會回 400 INVALID_OWNER）。
  const eligibleOwners = createdEmployees.filter(
    (e) => e.role !== "ADMIN" && e.status === "ACTIVE",
  );
  const ownersForVehicles = (() => {
    const withOwner = VEHICLE_COUNT - VEHICLES_WITHOUT_OWNER;
    const slots: Array<string | null> = [];
    for (let i = 0; i < withOwner; i += 1) {
      slots.push(pick(eligibleOwners.length > 0 ? eligibleOwners : createdEmployees).id);
    }
    for (let i = 0; i < VEHICLES_WITHOUT_OWNER; i += 1) slots.push(null);
    return shuffle(slots);
  })();

  const statusSlots: Array<"AVAILABLE" | "MAINTENANCE" | "RETIRED"> = [];
  STATUS_BUCKETS.forEach(([status, count]) => {
    for (let i = 0; i < count; i += 1) statusSlots.push(status);
  });
  while (statusSlots.length < VEHICLE_COUNT) statusSlots.push("AVAILABLE");
  shuffle(statusSlots);

  const monthSlots: number[] = [];
  for (let m = 0; m < 12; m += 1) {
    for (let i = 0; i < 3; i += 1) monthSlots.push(m);
  }
  while (monthSlots.length < VEHICLE_COUNT) {
    monthSlots.push(randomInt(0, 11));
  }
  shuffle(monthSlots);

  const usedPlates = new Set<string>();
  for (let i = 0; i < VEHICLE_COUNT; i += 1) {
    const make = pick(VEHICLE_MAKES);
    const model = pick(VEHICLE_MODELS_BY_MAKE[make] ?? ["Standard"]);
    await prisma.vehicle.create({
      data: {
        plate: randomPlate(usedPlates),
        make,
        model,
        year: randomInt(2015, new Date().getFullYear()),
        color: pick(VEHICLE_COLORS),
        status: statusSlots[i]!,
        mileage: randomInt(0, 180_000),
        purchasedAt: randomDateForMonthOffset(monthSlots[i]!),
        ownerId: ownersForVehicles[i]!,
      },
    });
  }

  const stats = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { status: "INACTIVE" } }),
    prisma.employee.count({ where: { role: "ADMIN" } }),
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { ownerId: null } }),
  ]);

  console.log(`seed:mock: 完成`);
  console.log(`  員工總數: ${stats[0]}（ADMIN ${stats[2]}、INACTIVE ${stats[1]}）`);
  console.log(`  車輛總數: ${stats[3]}（無 owner ${stats[4]}）`);
  console.log(`  Mock 帳號密碼一律為: ${MOCK_PASSWORD}`);
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
