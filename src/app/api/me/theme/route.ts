import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, THEME_COOKIE } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { theme } = await req.json();
  if (theme !== "dark" && theme !== "light") {
    return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
  }

  const userId = parseInt(session.sub, 10);
  await prisma.$executeRaw`UPDATE users SET theme = ${theme}, updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(THEME_COOKIE, theme, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
