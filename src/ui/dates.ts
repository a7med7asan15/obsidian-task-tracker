const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface Badge {
  text: string;
  tone: 'overdue' | 'soon' | 'normal';
}

function midnight(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dueBadge(due: string | null, today: Date): Badge | null {
  if (!due || !DATE_RE.test(due)) return null;
  const [y, m, d] = due.split('-').map(Number);
  const dueMs = Date.UTC(y, m - 1, d);
  const days = Math.round((dueMs - midnight(today)) / 86_400_000);

  if (days < 0) {
    const n = Math.abs(days);
    return { text: `Overdue by ${n} ${n === 1 ? 'day' : 'days'}`, tone: 'overdue' };
  }
  if (days === 0) return { text: 'Due today', tone: 'soon' };
  const text = `Due in ${days} ${days === 1 ? 'day' : 'days'}`;
  return { text, tone: days <= 2 ? 'soon' : 'normal' };
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
