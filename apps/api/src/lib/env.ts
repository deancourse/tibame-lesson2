import "./loadDotenv.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`環境變數 ${name} 未設定`);
  return v;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  API_PORT: Number(process.env.API_PORT ?? 8090),
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3087",
  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "8h",
  COOKIE_SECRET: required("COOKIE_SECRET"),
  NODE_ENV: process.env.NODE_ENV ?? "development",
};

export const isProd = env.NODE_ENV === "production";
