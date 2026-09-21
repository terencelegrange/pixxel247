import { NextResponse } from "next/server";
import { getConfiguredDialect, isSetupComplete } from "@/lib/setup";

export async function GET() {
  return NextResponse.json({ complete: isSetupComplete(), dialect: isSetupComplete() ? getConfiguredDialect() : null });
}
