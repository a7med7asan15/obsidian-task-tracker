import { useEffect, useRef, useState } from 'preact/hooks';
import { Notice } from 'obsidian';
import type { TaskIndex } from '../index/taskIndex';
import type { TaskWriter } from '../write/writer';
import type { TaskTrackerSettings } from '../settings/types';
import { applyQuery } from '../query/apply';
import { sortedSchema } from '../schema/validate';
import { Store } from './store';
import type { ProjectRegistry } from '../settings/projectRegistry';
import { parentOf } from '../settings/projectFile';
import { TaskList } from './TaskList';
import { FilterBar } from './FilterBar';
import { TaskDetail } from './TaskDetail';

export interface AppProps {
  index: TaskIndex;
  writer: TaskWriter;
  registry: ProjectRegistry;
  store: Store;
  settings: () => TaskTrackerSettings;
  openAsNote: (path: string) => void;
  onCreate: (project: string | null) => void;
  onCreateProject: () => void;
  onProjectSettings: (project: string | null) => void;
}

function useRevision(index: TaskIndex, store: Store, registry: ProjectRegistry): void {
  const [, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    const offs = [index.onChange(bump), store.subscribe(bump), registry.onChange(bump)];
    return () => { for (const off of offs) off(); };
  }, [index, store, registry]);
}

const WIDTH_KEY = 'task-tracker-list-width';
const DEFAULT_WIDTH = 420;
const MIN_LIST = 240;
const MIN_DETAIL = 320;
/** Below this view width the panes stack: list, or detail with a back button. */
const NARROW_BELOW = 680;

function loadWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(n) && n >= MIN_LIST ? n : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function saveWidth(n: number): void {
  try { window.localStorage.setItem(WIDTH_KEY, String(Math.round(n))); } catch { /* ignore */ }
}

/** Tracks the root's width so the layout follows the pane, not the window. */
function useWidth(el: { current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el.current) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el.current);
    return () => ro.disconnect();
  }, [el]);
  return width;
}

export function App({
  index, writer, registry, store, openAsNote, onCreate, onCreateProject, onProjectSettings,
}: AppProps) {
  useRevision(index, store, registry);
  const { query, selectedPath, project: wanted } = store.getState();
  // A saved project whose file is gone (or not indexed yet) shows as "No project"
  // without forgetting the choice.
  const current = wanted !== null && registry.get(wanted) ? wanted : null;
  const scope = registry.scopeFor(current);
  const schema = sortedSchema(scope.schema);
  const scopeTasks = index.all().filter((t) => parentOf(t.path) === scope.tasksFolder);
  const groups = applyQuery(scopeTasks, query, schema, scope.doneStatuses, scope.statusFieldKey);
  const selected = selectedPath === null ? undefined : index.get(selectedPath);
  const detailScope = selected ? registry.scopeForPath(selected.path) : scope;
  const warnings = registry.warningsFor(current);
  const projectNames = [...new Set(registry.all().map((p) => p.name ?? ''))];

  const root = useRef<HTMLDivElement>(null);
  const rootWidth = useWidth(root);
  const narrow = rootWidth > 0 && rootWidth < NARROW_BELOW;
  const [listWidth, setListWidth] = useState(loadWidth);
  const maxList = Math.max(MIN_LIST, rootWidth - MIN_DETAIL);
  const shownWidth = rootWidth > 0 ? Math.min(listWidth, maxList) : listWidth;

  const startDrag = (e: PointerEvent) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = shownWidth;
    let latest = startWidth;
    const move = (ev: PointerEvent) => {
      latest = Math.min(Math.max(startWidth + ev.clientX - startX, MIN_LIST), maxList);
      setListWidth(latest);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      saveWidth(latest);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  /** Every write goes through here so a failure surfaces once, consistently. */
  const guard = (op: () => Promise<unknown>) => {
    void op().catch((e: unknown) => {
      new Notice(`Task Tracker: ${e instanceof Error ? e.message : String(e)}`);
      void index.rebuild();
    });
  };

  return (
    <div
      ref={root}
      class={`tt-root${narrow ? ' is-narrow' : ''}${selected ? ' has-selection' : ''}`}
    >
      <div class="tt-sidebar" style={narrow ? undefined : { width: `${shownWidth}px` }}>
        <FilterBar
          query={query}
          schema={schema}
          tasks={scopeTasks}
          projects={projectNames}
          project={current}
          onProject={(name) => store.setProject(name, registry.scopeFor(name).schema.map((f) => f.key))}
          onProjectSettings={() => onProjectSettings(current)}
          onQuery={(patch) => store.setQuery(patch)}
          onToggleFilter={(k, v) => store.toggleFilter(k, v)}
          onClearFilter={(k) => store.clearFilter(k)}
          onCreate={() => onCreate(current)}
          onCreateProject={onCreateProject}
        />
        {warnings.length > 0 && (
          <div class="tt-errors tt-project-warnings">
            {warnings.map((w) => (
              <div key={`${w.filePath}:${w.message}`}>
                ⚠ <a class="tt-link" onClick={() => openAsNote(w.filePath)}>{w.filePath}</a>: {w.message}
              </div>
            ))}
          </div>
        )}
        <TaskList
          groups={groups}
          schema={schema}
          dueFieldKey={scope.dueFieldKey}
          selectedPath={selectedPath}
          onSelect={(p) => { store.select(p); void index.loadBody(p); }}
        />
      </div>

      {!narrow && (
        <div
          class="tt-resizer"
          title="Drag to resize · double-click to reset"
          onPointerDown={startDrag}
          onDblClick={() => { setListWidth(DEFAULT_WIDTH); saveWidth(DEFAULT_WIDTH); }}
        />
      )}

      <div class="tt-detail">
        {narrow && selected !== undefined && (
          <button class="tt-back" onClick={() => store.select(null)}>← Back to list</button>
        )}
        {selected === undefined ? (
          <div class="tt-empty">Select a task.</div>
        ) : (
          <TaskDetail
            task={selected}
            schema={sortedSchema(detailScope.schema)}
            dueFieldKey={detailScope.dueFieldKey}
            statusFieldKey={detailScope.statusFieldKey}
            duplicateId={selected.id !== null && index.duplicateIds().has(selected.id)}
            onAssignId={() => guard(async () => {
              await writer.setField(selected.path, 'id', writer.nextId(index.ids(), detailScope.idPrefix));
              await index.loadBody(selected.path);
            })}
            onSetField={(k, v) => guard(async () => {
              await writer.setField(selected.path, k, v);
              await index.loadBody(selected.path);
            })}
            onSetTitle={(t) => guard(async () => {
              const { path: next, collision } = await writer.setTitle(selected.path, t);
              if (collision) {
                new Notice(
                  'Task Tracker: kept the old filename -- a file with that name already exists.',
                );
              }
              store.select(next);
              await index.loadBody(next);
            })}
            onSetDescription={(d) => guard(async () => {
              await writer.setDescriptionAt(selected.path, d);
              await index.loadBody(selected.path);
            })}
            onAddComment={(b) => guard(async () => {
              await writer.addCommentAt(selected.path, b);
              await index.loadBody(selected.path);
            })}
            onEditComment={(id, b) => guard(async () => {
              await writer.editCommentAt(selected.path, id, b);
              await index.loadBody(selected.path);
            })}
            onDeleteComment={(id) => guard(async () => {
              await writer.deleteCommentAt(selected.path, id);
              await index.loadBody(selected.path);
            })}
            onOpenAsNote={() => openAsNote(selected.path)}
          />
        )}
      </div>
    </div>
  );
}
