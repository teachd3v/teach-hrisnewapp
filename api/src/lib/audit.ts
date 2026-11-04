import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { audit_log } from '../db/schema';

export interface AuditEntry {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, unknown>;
  ip?: string | null;
}

/** Nilai untuk disisipkan (mis. di db.batch bersama aksinya agar atomik). */
export const auditRow = (e: AuditEntry): typeof audit_log.$inferInsert => ({
  id: crypto.randomUUID(),
  at: new Date().toISOString(),
  actor_id: e.actorId ?? null,
  actor_name: e.actorName ?? null,
  action: e.action,
  target_type: e.targetType ?? null,
  target_id: e.targetId ?? null,
  target_label: e.targetLabel ?? null,
  details: e.details ? JSON.stringify(e.details) : null,
  ip: e.ip ?? null,
});

export const writeAudit = (db: DrizzleD1Database, e: AuditEntry) => db.insert(audit_log).values(auditRow(e));
