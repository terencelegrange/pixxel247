import { prisma } from "./prisma";

export interface AuditOptions {
  userId?: number | null;
  action: string;          // e.g. LOGIN, CREATE, UPDATE, DELETE, APPROVE, REJECT
  resource: string;        // e.g. users, sessions
  resourceId?: string | number | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

export async function auditLog(opts: AuditOptions): Promise<void> {
  try {
    const details = opts.details ? JSON.stringify(opts.details) : null;
    const resourceId = opts.resourceId != null ? String(opts.resourceId) : null;

    await prisma.$executeRaw`
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip, created_at)
      VALUES (
        ${opts.userId ?? null},
        ${opts.action},
        ${opts.resource},
        ${resourceId},
        ${details},
        ${opts.ip ?? null},
        CURRENT_TIMESTAMP
      )
    `;
  } catch (e) {
    // Never let audit failures break the main flow
    console.error("[audit] failed to write:", e);
  }
}

export function getIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return null;
}
