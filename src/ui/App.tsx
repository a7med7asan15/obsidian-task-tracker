import { useEffect, useRef, useState } from 'preact/hooks';
import { Notice } from 'obsidian';
import type { TaskIndex } from '../index/taskIndex';
import type { TaskWriter } from '../write/writer';
import type { TaskTrackerSettings } from '../settings/types';
import { applyQuery } from '../query/apply';
import { sortedSchema } from '../schema/validate';
import { Store } from './store';
import { TaskList } from './TaskList';
import { FilterBar } from './FilterBar';
import { TaskDetail } from './TaskDetail';

export interface AppProps {
  index: TaskIndex;
  writer: TaskWriter;
  store: Store;
  settings: () => TaskTrackerSettings;
  openAsNote: (path: string) => void;
  onCreate: () => void;
  onCreateProject: () => void;
}

function useRevision(index: TaskIndex, store: Store): void {
  const [, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    const offIndex = index.onChange(bump);
    const offStore = store.subscribe(bump);
    return () => { offIndex(); offStore(); };
  }, [index, store]);
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
  index, writer, store, settings, openAsNote, onCreate, onCreateProject,
}: AppProps) {
  useRevision(index, store);
  const s = settings();
  const { query, selectedPath } = store.getState();
  const schema = sortedSchema(s.schema);
  const groups = applyQuery(index.all(), query, schema, s.doneStatuses, s.statusFieldKey);
  const selected = selectedPath === null ? undefined : index.get(selectedPath);

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
          tasks={index.all()}
          onQuery={(patch) => store.setQuery(patch)}
          onToggleFilter={(k, v) => store.toggleFilter(k, v)}
          onClearFilter={(k) => store.clearFilter(k)}
          onCreate={onCreate}
          onCreateProject={onCreateProject}
        />
        <TaskList
          groups={groups}
          schema={schema}
          dueFieldKey={s.dueFieldKey}
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
            schema={schema}
            dueFieldKey={s.dueFieldKey}
            duplicateId={selected.id !== null && index.duplicateIds().has(selected.id)}
            onAssignId={() => guard(async () => {
              await writer.setField(selected.path, 'id', writer.nextId(index.ids()));
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
