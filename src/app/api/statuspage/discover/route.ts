import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMonitoring, statuspageApiUrl } from "@/lib/monitoring";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditMonitoring(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { url } = await req.json();
    const endpoint = statuspageApiUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Status API returned HTTP ${response.status}`);
    const data = await response.json() as { components?: Array<{ id: string; name: string; status?: string; group?: boolean }> };
    if (!Array.isArray(data.components)) throw new Error("This URL did not return a Statuspage components feed");
    return NextResponse.json({ endpoint, components: data.components.filter((component) => !component.group).map(({ id, name, status }) => ({ id, name, status: status || "unknown" })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not discover Statuspage components" }, { status: 400 });
  }
}
