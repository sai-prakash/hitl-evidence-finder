import type { Relation } from './review';

/** 'confirm' / 'reject' come from older logs that only judged the top page. */
export type AuditDecision = Relation | 'confirm' | 'reject';

export type AuditEntry = {
  id: string;
  claimId: string;
  claimText: string;
  pageId: string;
  pageTitle: string;
  score: number;
  decision: AuditDecision;
  note?: string;
  /** ISO timestamp */
  at: string;
};

const STORAGE_KEY = 'hitl-evidence-finder.audit.v1';

export function loadAuditLog(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAuditLog(entries: AuditEntry[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* Storage may be full or unavailable. */ }
}

const sameClaimPage = (a: Pick<AuditEntry, 'claimId' | 'claimText' | 'pageId'>, b: Pick<AuditEntry, 'claimId' | 'claimText' | 'pageId'>) =>
  a.claimId === b.claimId && a.claimText === b.claimText && a.pageId === b.pageId;

/** Add a judgment, replacing any earlier one for the same claim + page. */
/** Builds on the in-memory log (if given) so judgments survive when storage writes fail. */
export function appendAudit(entry: Omit<AuditEntry, 'id' | 'at'>, current?: readonly AuditEntry[]): AuditEntry[] {
  const next: AuditEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  const all = [next, ...(current ?? loadAuditLog()).filter((e) => !sameClaimPage(e, next))].slice(0, 100);
  saveAuditLog(all);
  return all;
}

/** The reviewer's current call per page for one claim (newest entry wins). */
export function judgmentsFor(log: readonly AuditEntry[], claimId: string, claimText: string): Map<string, Relation> {
  const out = new Map<string, Relation>();
  for (const e of log) {
    if (e.claimId !== claimId || e.claimText !== claimText || out.has(e.pageId)) continue;
    if (e.decision === 'supports' || e.decision === 'contradicts' || e.decision === 'not-enough-info') out.set(e.pageId, e.decision);
  }
  return out;
}

export function clearAuditLog(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
}

export function formatAuditTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
