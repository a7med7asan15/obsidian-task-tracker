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

function badgeValues(task: Task, schema: FieldDef[]): { key: string; text: string }[] {
  return schema
    .filter((f) => f.showInList)
    .map((f) => {
      const raw = task.fields[f.key];
      if (raw === null || raw === undefined || raw === '') return null;
      const text = Array.isArray(raw) ? raw.join(', ') : String(raw);
      return { key: f.key, text };
    })
    .filter((b): b is { key: string; text: string } => b !== null);
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
                    <span class="tt-badge" key={b.key}>{b.text}</span>
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
