import { useEffect, useState } from 'preact/hooks';
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

export function App({ index, writer, store, settings, openAsNote, onCreate }: AppProps) {
  useRevision(index, store);
  const s = settings();
  const { query, selectedPath } = store.getState();
  const schema = sortedSchema(s.schema);
  const groups = applyQuery(index.all(), query, schema, s.doneStatuses, s.statusFieldKey);
  const selected = selectedPath === null ? undefined : index.get(selectedPath);

  /** Every write goes through here so a failure surfaces once, consistently. */
  const guard = (op: () => Promise<unknown>) => {
    void op().catch((e: unknown) => {
      new Notice(`Task Tracker: ${e instanceof Error ? e.message : String(e)}`);
      void index.rebuild();
    });
  };

  return (
    <div class="tt-root">
      <div class="tt-sidebar">
        <FilterBar
          query={query}
          schema={schema}
          onQuery={(patch) => store.setQuery(patch)}
          onToggleFilter={(k, v) => store.toggleFilter(k, v)}
          onCreate={onCreate}
        />
        <TaskList
          groups={groups}
          schema={schema}
          dueFieldKey={s.dueFieldKey}
          selectedPath={selectedPath}
          onSelect={(p) => { store.select(p); void index.loadBody(p); }}
        />
      </div>

      <div class="tt-detail">
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
