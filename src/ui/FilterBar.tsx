import { useState } from 'preact/hooks';
import type { FieldDef } from '../schema/types';
import type { Query } from '../query/types';
import type { Task } from '../model/types';
import { MultiPicker } from './MultiPicker';

interface Props {
  query: Query;
  schema: FieldDef[];
  tasks: Task[];
  onQuery: (patch: Partial<Query>) => void;
  onToggleFilter: (key: string, value: string) => void;
  onClearFilter: (key: string) => void;
  onCreate: () => void;
  onCreateProject: () => void;
  /** Names of every project, for the switcher. */
  projects: string[];
  /** Current project, or null for tasks without one. */
  project: string | null;
  onProject: (name: string | null) => void;
  onProjectSettings: () => void;
}

/** Fields whose values form a closed set are the ones worth offering as filters. */
function filterableFields(schema: FieldDef[]): FieldDef[] {
  return schema.filter((f) => f.type === 'select' || f.type === 'multiselect');
}

/**
 * The values a filter offers: the field's options, or -- for a free-form
 * multiselect with no options -- whatever values the tasks actually carry.
 */
export function filterOptions(def: FieldDef, tasks: Task[]): string[] {
  if ((def.options ?? []).length > 0) return def.options ?? [];
  const seen = new Set<string>();
  for (const t of tasks) {
    const raw = t.fields[def.key];
    for (const v of Array.isArray(raw) ? raw : [raw]) {
      if (typeof v === 'string' && v.length > 0) seen.add(v);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function FilterBar({
  query, schema, tasks, projects, project, onProject, onProjectSettings,
  onQuery, onToggleFilter, onClearFilter, onCreate, onCreateProject,
}: Props) {
  const [open, setOpen] = useState(false);

  const sortOptions = [
    { key: 'updated', label: 'Updated' },
    { key: 'created', label: 'Created' },
    { key: 'title', label: 'Title' },
    { key: 'id', label: 'ID' },
    ...schema.filter((f) => f.type === 'date' || f.type === 'number')
      .map((f) => ({ key: f.key, label: f.label })),
  ];

  const fields = filterableFields(schema)
    .map((f) => ({ def: f, options: filterOptions(f, tasks) }))
    .filter((f) => f.options.length > 0);
  const active = Object.values(query.filters).reduce((n, v) => n + v.length, 0);

  return (
    <div class="tt-filterbar">
      <div class="tt-filter-row">
        <select
          class="tt-project-select"
          value={project ?? ''}
          title="Project"
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            onProject(v === '' ? null : v);
          }}
        >
          <option value="">No project</option>
          {projects.map((p) => <option value={p} key={p}>{p}</option>)}
        </select>
        <button
          class="tt-icon-btn"
          title={project === null ? 'Settings for tasks without a project' : 'Project settings'}
          onClick={onProjectSettings}
        >
          ⚙
        </button>
        <button class="tt-create tt-create-secondary" onClick={onCreateProject} title="Create project">
          + Project
        </button>
      </div>

      <div class="tt-filter-row">
        <input
          class="tt-search"
          type="search"
          placeholder="Search…"
          value={query.search}
          onInput={(e) => onQuery({ search: (e.target as HTMLInputElement).value })}
        />
        <button class="mod-cta tt-create" onClick={onCreate} title="Create issue">+ Issue</button>
      </div>

      <div class="tt-filter-row tt-filter-row-compact">
        <button
          class={`tt-filter-toggle${open ? ' is-open' : ''}${active > 0 ? ' is-active' : ''}`}
          onClick={() => setOpen(!open)}
          title={open ? 'Hide filters' : 'Show filters'}
        >
          Filters{active > 0 ? ` · ${active}` : ''} {open ? '▴' : '▾'}
        </button>

        <select
          class="tt-compact-select"
          value={query.sortKey}
          title="Sort by"
          onChange={(e) => onQuery({ sortKey: (e.target as HTMLSelectElement).value })}
        >
          {sortOptions.map((o) => <option value={o.key} key={o.key}>↕ {o.label}</option>)}
        </select>

        <button
          class="tt-icon-btn"
          title="Toggle sort direction"
          onClick={() => onQuery({ sortDir: query.sortDir === 'asc' ? 'desc' : 'asc' })}
        >
          {query.sortDir === 'asc' ? '↑' : '↓'}
        </button>

        <select
          class="tt-compact-select"
          value={query.groupBy ?? ''}
          title="Group by"
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            onQuery({ groupBy: v === '' ? null : v });
          }}
        >
          <option value="">No grouping</option>
          {filterableFields(schema).map((f) => (
            <option value={f.key} key={f.key}>▤ {f.label}</option>
          ))}
        </select>

        <label class="tt-toggle" title="Hide done tasks">
          <input
            type="checkbox"
            checked={query.hideDone}
            onChange={(e) => onQuery({ hideDone: (e.target as HTMLInputElement).checked })}
          />
          Hide done
        </label>
      </div>

      {open && (
        <div class="tt-filter-pickers">
          {fields.map(({ def, options }) => (
            <MultiPicker
              key={def.key}
              label={def.label}
              options={options}
              selected={query.filters[def.key] ?? []}
              onToggle={(v) => onToggleFilter(def.key, v)}
              onClear={() => onClearFilter(def.key)}
            />
          ))}
          {active > 0 && (
            <button class="tt-picker-reset" onClick={() => onQuery({ filters: {} })}>
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
