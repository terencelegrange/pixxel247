import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";

const PUBLIC = ["/login", "/signup", "/setup", "/api/setup", "/api/auth/login", "/api/auth/signup", "/api/auth/device", "/api/health", "/avatars"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow API requests with Authorization: Bearer header to proceed to route handlers (for API key / bearer validation)
  const authHeader = req.headers.get("authorization");
  if (pathname.startsWith("/api/") && authHeader?.startsWith("Bearer ")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("bp_token")?.value;
  if (!token || !(await verifyToken(token))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
