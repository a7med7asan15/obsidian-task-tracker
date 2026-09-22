import type { Group } from '../query/types';
import type { Task } from '../model/types';
import type { FieldDef } from '../schema/types';
import { dueBadge } from './dates';

interface Props {
  groups: Group[];
  schema: FieldDef[];
  dueFieldKey: string | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

interface RowBadge { key: string; text: string; }

/** Status first, then priority, then the rest — Jira's row ordering. */
function badgeValues(task: Task, schema: FieldDef[]): RowBadge[] {
  const rank = (f: FieldDef): number =>
    f.key === 'status' ? 0 : f.key === 'priority' ? 1 : 2;
  return schema
    .filter((f) => f.showInList)
    .sort((a, b) => rank(a) - rank(b))
    .map((f) => {
      const raw = task.fields[f.key];
      if (raw === null || raw === undefined || raw === '') return null;
      let text: string;
      if (Array.isArray(raw)) text = raw.join(', ');
      else if (typeof raw === 'string') text = raw;
      else if (typeof raw === 'number' || typeof raw === 'boolean') text = String(raw);
      else return null;
      return { key: f.key, text };
    })
    .filter((b): b is RowBadge => b !== null);
}

function statusClass(text: string): string {
  return `tt-status-${text.toLowerCase().replace(/\s+/g, '-')}`;
}

export function TaskList({ groups, schema, dueFieldKey, selectedPath, onSelect }: Props) {
  const today = new Date();
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);

  if (total === 0) {
    return <div class="tt-empty">No tasks match this filter.</div>;
  }

  return (
    <div class="tt-list">
      {groups.map((group) => (
        <div class="tt-group" key={group.key}>
          {group.key !== '' && (
            <div class="tt-group-header">
              {group.key} <span class="tt-count">{group.tasks.length}</span>
            </div>
          )}
          {group.tasks.map((task) => {
            const due = dueFieldKey ? (task.fields[dueFieldKey] as string | undefined) : null;
            const badge = dueBadge(due ?? null, today);
            return (
              <div
                key={task.path}
                class={`tt-row${task.path === selectedPath ? ' is-selected' : ''}`}
                onClick={() => onSelect(task.path)}
              >
                <div class="tt-row-top">
                  <span class="tt-id">{task.id ?? '—'}</span>
                  <span class="tt-title">{task.title}</span>
                  {task.parseErrors.length > 0 && (
                    <span class="tt-warn" title={task.parseErrors.join('\n')}>⚠</span>
                  )}
                </div>
                <div class="tt-row-badges">
                  {badgeValues(task, schema).map((b) => (
                    <span
                      class={`tt-badge${b.key === 'status' ? ` ${statusClass(b.text)}` : ''}`}
                      key={b.key}
                    >
                      {b.text}
                    </span>
                  ))}
                  {badge && <span class={`tt-badge tt-due-${badge.tone}`}>{badge.text}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
