import { PrismaClient as MysqlPrismaClient } from "@prisma/client";
import { PrismaClient as SqlitePrismaClient } from "@/generated/sqlite-client";
import { databaseUrlFromConfig, getConfiguredDialect, getSiteConfig } from "./setup";

export interface PrismaFacade {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: PrismaFacade) => Promise<T>): Promise<T>;
  $disconnect(): Promise<void>;
  pixxelSyncConfig: any;
  asset: any;
}

type AnyClient = MysqlPrismaClient | SqlitePrismaClient;
const globalForPrisma = globalThis as unknown as { pixxel247Prisma?: AnyClient; pixxel247PrismaKey?: string };

function configuredUrl() {
  const config = getSiteConfig();
  if (config?.db) return databaseUrlFromConfig(config.db);
  return process.env.DATABASE_URL;
}

function getClient(): AnyClient {
  const dialect = getConfiguredDialect();
  const url = configuredUrl();
  if (!url) throw new Error("Database is not configured. Complete first-run setup.");
  const key = `${dialect}:${url}`;
  if (!globalForPrisma.pixxel247Prisma || globalForPrisma.pixxel247PrismaKey !== key) {
    if (globalForPrisma.pixxel247Prisma) globalForPrisma.pixxel247Prisma.$disconnect().catch(() => {});
    globalForPrisma.pixxel247Prisma = dialect === "sqlite"
      ? new SqlitePrismaClient({ datasources: { db: { url } }, log: ["error"] })
      : new MysqlPrismaClient({ datasources: { db: { url } }, log: ["error"] });
    globalForPrisma.pixxel247PrismaKey = key;
  }
  return globalForPrisma.pixxel247Prisma;
}

export async function resetPrisma() {
  if (globalForPrisma.pixxel247Prisma) await globalForPrisma.pixxel247Prisma.$disconnect().catch(() => {});
  globalForPrisma.pixxel247Prisma = undefined;
  globalForPrisma.pixxel247PrismaKey = undefined;
}

export const prisma = new Proxy({} as PrismaFacade, {
  get(_target, property) {
    const value = (getClient() as any)[property];
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
