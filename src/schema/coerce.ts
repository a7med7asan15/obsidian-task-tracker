import type { CoerceResult, FieldDef, FieldValue } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export function coerceValue(def: FieldDef, raw: unknown): CoerceResult {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };

  switch (def.type) {
    case 'text':
    case 'person':
      return { ok: true, value: String(raw) };

    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, raw };
    }

    case 'date': {
      const s = String(raw);
      return DATE_RE.test(s) && isRealDate(s)
        ? { ok: true, value: s }
        : { ok: false, raw };
    }

    case 'select': {
      const s = String(raw);
      return (def.options ?? []).includes(s) ? { ok: true, value: s } : { ok: false, raw };
    }

    case 'multiselect': {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const options = def.options ?? [];
      // An empty options list means the field accepts any tag.
      if (options.length > 0 && !arr.every((v) => options.includes(v))) {
        return { ok: false, raw };
      }
      return { ok: true, value: arr };
    }

    case 'checkbox': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      const s = String(raw).toLowerCase();
      if (s === 'true' || s === 'yes') return { ok: true, value: true };
      if (s === 'false' || s === 'no') return { ok: true, value: false };
      return { ok: false, raw };
    }
  }
}

export function isEmpty(value: FieldValue): boolean {
  if (value === null) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
