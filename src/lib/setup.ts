import fs from "fs";
import path from "path";

export type DbDialect = "mysql" | "sqlite";

export interface MysqlDbConfig {
  dialect: "mysql";
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
}

export interface SqliteDbConfig {
  dialect: "sqlite";
  file: string;
}

export type DbConfig = MysqlDbConfig | SqliteDbConfig;

export interface SiteConfig {
  setupComplete: boolean;
  db: DbConfig;
}

export function getDataDirectory() {
  return path.resolve(process.cwd(), process.env.PIXXEL247_DATA_DIR || "data");
}

export function getConfigPath() {
  return path.join(getDataDirectory(), "site.config.json");
}

export function getSiteConfig(): SiteConfig | null {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), "utf8")) as SiteConfig;
  } catch {
    return null;
  }
}

export function isSetupComplete() {
  if (getSiteConfig()?.setupComplete === true) return true;
  // Preserve the existing environment-configured development/deployment path.
  return Boolean(process.env.DATABASE_URL && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH);
}

export function writeSiteConfig(config: SiteConfig) {
  const dataDir = getDataDirectory();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
}

export function resolveSqlitePath(file: string) {
  const dataDir = getDataDirectory();
  const normalized = file.trim() || "pixxel247.db";
  if (path.isAbsolute(normalized) || normalized.includes("..")) throw new Error("SQLite filename must stay within the application data directory");
  return path.join(dataDir, normalized);
}

export function databaseUrlFromConfig(config: DbConfig): string {
  if (config.dialect === "sqlite") return `file:${resolveSqlitePath(config.file)}`;
  const url = new URL("mysql://placeholder/database");
  url.hostname = config.host;
  url.port = String(config.port || 3306);
  url.username = config.user;
  url.password = config.password;
  url.pathname = `/${config.name}`;
  return url.toString();
}

export function getConfiguredDialect(): DbDialect {
  return getSiteConfig()?.db.dialect || "mysql";
}
