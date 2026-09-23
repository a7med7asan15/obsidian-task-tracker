import { useEffect, useState } from 'preact/hooks';
import type { FieldDef } from '../schema/types';
import { coerceValue } from '../schema/coerce';
import { MultiPicker } from './MultiPicker';

interface Props {
  def: FieldDef;
  value: unknown;
  onCommit: (value: unknown) => void;
}

/** One input per field type. Text-ish inputs commit on blur; the rest commit immediately. */
export function FieldWidget({ def, value, onCommit }: Props) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));

  useEffect(() => {
    setDraft(value === null || value === undefined ? '' : String(value));
  }, [value, def.key]);

  const result = coerceValue(def, value);
  const invalid = !result.ok;

  switch (def.type) {
    case 'select': {
      const current = typeof value === 'string' ? value : '';
      const options = def.options ?? [];
      // A value outside the options list survives an options edit: show it,
      // marked, rather than silently rendering as "no value".
      const orphaned = current !== '' && !options.includes(current);
      return (
        <select
          class={orphaned ? 'tt-invalid' : ''}
          value={current}
          onChange={(e) => onCommit((e.target as HTMLSelectElement).value || null)}
        >
          <option value="">—</option>
          {orphaned && <option value={current}>{current} (not an option)</option>}
          {options.map((o) => <option value={o} key={o}>{o}</option>)}
        </select>
      );
    }

    case 'multiselect': {
      const selected = Array.isArray(value) ? value.map(String) : [];
      const options = def.options ?? [];
      if (options.length === 0) {
        // Free-form tags: comma-separated text.
        return (
          <input
            type="text"
            value={selected.join(', ')}
            placeholder="comma, separated"
            onBlur={(e) => {
              const parts = (e.target as HTMLInputElement).value
                .split(',').map((s) => s.trim()).filter((s) => s.length > 0);
              onCommit(parts);
            }}
          />
        );
      }
      return (
        <MultiPicker
          label={selected.length === 0 ? 'None' : ''}
          options={options}
          selected={selected}
          showValues
          onToggle={(o) => onCommit(
            selected.includes(o) ? selected.filter((v) => v !== o) : [...selected, o],
          )}
          onClear={() => onCommit([])}
        />
      );
    }

    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onCommit((e.target as HTMLInputElement).checked)}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onCommit((e.target as HTMLInputElement).value || null)}
        />
      );

    case 'number':
      return (
        <input
          class={invalid ? 'tt-invalid' : ''}
          type="number"
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onBlur={() => onCommit(draft === '' ? null : Number(draft))}
        />
      );

    default:
      return (
        <input
          class={invalid ? 'tt-invalid' : ''}
          type="text"
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onBlur={() => onCommit(draft === '' ? null : draft)}
        />
      );
  }
}
