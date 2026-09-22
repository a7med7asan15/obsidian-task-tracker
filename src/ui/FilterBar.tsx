import type { FieldDef } from '../schema/types';
import type { Query } from '../query/types';

interface Props {
  query: Query;
  schema: FieldDef[];
  onQuery: (patch: Partial<Query>) => void;
  onToggleFilter: (key: string, value: string) => void;
  onCreate: () => void;
  onCreateProject: () => void;
}

/** Fields whose values form a closed set are the ones worth offering as chips. */
function filterableFields(schema: FieldDef[]): FieldDef[] {
  return schema.filter((f) => f.type === 'select' || f.type === 'multiselect');
}

export function FilterBar({
  query, schema, onQuery, onToggleFilter, onCreate, onCreateProject,
}: Props) {
  const sortOptions = [
    { key: 'updated', label: 'Updated' },
    { key: 'created', label: 'Created' },
    { key: 'title', label: 'Title' },
    { key: 'id', label: 'ID' },
    ...schema.filter((f) => f.type === 'date' || f.type === 'number')
      .map((f) => ({ key: f.key, label: f.label })),
  ];

  return (
    <div class="tt-filterbar">
      <div class="tt-filter-row">
        <input
          class="tt-search"
          type="search"
          placeholder="Search tasks…"
          value={query.search}
          onInput={(e) => onQuery({ search: (e.target as HTMLInputElement).value })}
        />
        <button class="mod-cta tt-create" onClick={onCreate}>Create issue</button>
        <button class="tt-create tt-create-secondary" onClick={onCreateProject}>Create project</button>
      </div>

      <div class="tt-filter-row">
        <select
          value={query.sortKey}
          onChange={(e) => onQuery({ sortKey: (e.target as HTMLSelectElement).value })}
        >
          {sortOptions.map((o) => <option value={o.key} key={o.key}>Sort: {o.label}</option>)}
        </select>

        <button
          class="tt-icon-btn"
          title="Toggle sort direction"
          onClick={() => onQuery({ sortDir: query.sortDir === 'asc' ? 'desc' : 'asc' })}
        >
          {query.sortDir === 'asc' ? '↑' : '↓'}
        </button>

        <select
          value={query.groupBy ?? ''}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            onQuery({ groupBy: v === '' ? null : v });
          }}
        >
          <option value="">No grouping</option>
          {filterableFields(schema).map((f) => (
            <option value={f.key} key={f.key}>Group: {f.label}</option>
          ))}
        </select>

        <label class="tt-toggle">
          <input
            type="checkbox"
            checked={query.hideDone}
            onChange={(e) => onQuery({ hideDone: (e.target as HTMLInputElement).checked })}
          />
          Hide done
        </label>
      </div>

      {filterableFields(schema).map((f) => (
        <div class="tt-chips" key={f.key}>
          <span class="tt-chips-label">{f.label}</span>
          {(f.options ?? []).map((opt) => {
            const active = (query.filters[f.key] ?? []).includes(opt);
            return (
              <button
                key={opt}
                class={`tt-chip${active ? ' is-active' : ''}`}
                onClick={() => onToggleFilter(f.key, opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
