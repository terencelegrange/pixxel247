import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import fs from "fs";
import { getDataDirectory, resolveSqlitePath } from "@/lib/setup";

export async function POST(req: Request) {
  const body = await req.json();
  if (body.dialect === "sqlite") {
    try {
      const file = resolveSqlitePath(String(body.file || "pixxel247.db"));
      fs.mkdirSync(getDataDirectory(), { recursive: true });
      fs.accessSync(getDataDirectory(), fs.constants.W_OK);
      return NextResponse.json({ success: true, file });
    } catch (error) {
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "SQLite path is not writable" }, { status: 400 });
    }
  }

  const { host, port, user, password, name } = body;
  if (!host || !user || !name) return NextResponse.json({ success: false, error: "Host, username, and database name are required" }, { status: 400 });
  let connection: mysql.Connection | undefined;
  try {
    connection = await mysql.createConnection({ host, port: Number(port) || 3306, user, password: password || "", connectTimeout: 8000 });
    const safeName = String(name).replace(/`/g, "``");
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${safeName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Connection failed" }, { status: 400 });
  } finally {
    await connection?.end().catch(() => {});
  }
}
