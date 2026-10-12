export type AuditDecision = 'confirm' | 'reject';

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

export function appendAudit(entry: Omit<AuditEntry, 'id' | 'at'>): AuditEntry[] {
  const next: AuditEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  const all = [next, ...loadAuditLog()].slice(0, 100);
  saveAuditLog(all);
  return all;
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
