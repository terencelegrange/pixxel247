import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { hashPassword, initDb, resetInitDb } from "@/lib/initDb";
import { prisma, resetPrisma } from "@/lib/prisma";
import { DbConfig, isSetupComplete, resolveSqlitePath, writeSiteConfig } from "@/lib/setup";

export async function POST(req: Request) {
  if (isSetupComplete()) return NextResponse.json({ error: "Setup has already been completed" }, { status: 400 });
  const body = await req.json();
  const adminEmail = String(body.admin?.email || "").trim().toLowerCase();
  const adminName = String(body.admin?.name || "").trim();
  const adminPassword = String(body.admin?.password || "");
  if (!adminEmail || !adminPassword || adminPassword.length < 8) return NextResponse.json({ error: "An administrator email and password of at least 8 characters are required" }, { status: 400 });

  let db: DbConfig;
  if (body.db?.dialect === "sqlite") {
    const file = String(body.db.file || "pixxel247.db").trim();
    resolveSqlitePath(file);
    db = { dialect: "sqlite", file };
  } else {
    if (!body.db?.host || !body.db?.user || !body.db?.name) return NextResponse.json({ error: "MySQL host, username, and database name are required" }, { status: 400 });
    db = { dialect: "mysql", host: String(body.db.host).trim(), port: Number(body.db.port) || 3306, user: String(body.db.user).trim(), password: String(body.db.password || ""), name: String(body.db.name).trim() };
  }

  try {
    if (db.dialect === "mysql") {
      const connection = await mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password, connectTimeout: 8000 });
      try {
        const safeName = db.name.replace(/`/g, "``");
        await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${safeName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      } finally {
        await connection.end();
      }
    }

    writeSiteConfig({ setupComplete: false, db });
    await resetPrisma();
    resetInitDb();
    await initDb();
    const passwordHash = await hashPassword(adminPassword);
    await prisma.$executeRaw`
      INSERT INTO users (email, password_hash, name, role, status, theme, created_at, updated_at)
      VALUES (${adminEmail}, ${passwordHash}, ${adminName || null}, 'admin', 'approved', 'dark', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    writeSiteConfig({ setupComplete: true, db });
    return NextResponse.json({ success: true });
  } catch (error) {
    writeSiteConfig({ setupComplete: false, db });
    await resetPrisma();
    resetInitDb();
    return NextResponse.json({ error: error instanceof Error ? error.message : "Setup failed" }, { status: 500 });
  }
}
