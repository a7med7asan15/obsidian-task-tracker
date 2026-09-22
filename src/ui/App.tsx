import { useEffect, useState } from 'preact/hooks';
import type { TaskIndex } from '../index/taskIndex';
import type { TaskWriter } from '../write/writer';
import type { TaskTrackerSettings } from '../settings/types';
import { applyQuery } from '../query/apply';
import { sortedSchema } from '../schema/validate';
import { Store } from './store';
import { TaskList } from './TaskList';

export interface AppProps {
  index: TaskIndex;
  writer: TaskWriter;
  store: Store;
  settings: () => TaskTrackerSettings;
  openAsNote: (path: string) => void;
}

/** Re-render whenever the index or the store changes. */
function useRevision(index: TaskIndex, store: Store): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    const offIndex = index.onChange(bump);
    const offStore = store.subscribe(bump);
    return () => { offIndex(); offStore(); };
  }, [index, store]);
  return rev;
}

export function App({ index, store, settings }: AppProps) {
  useRevision(index, store);
  const s = settings();
  const { query, selectedPath } = store.getState();
  const schema = sortedSchema(s.schema);

  const groups = applyQuery(index.all(), query, schema, s.doneStatuses, s.statusFieldKey);

  return (
    <div class="tt-root">
      <div class="tt-sidebar">
        <TaskList
          groups={groups}
          schema={schema}
          dueFieldKey={s.dueFieldKey}
          selectedPath={selectedPath}
          onSelect={(p) => { store.select(p); void index.loadBody(p); }}
        />
      </div>
      <div class="tt-detail">
        {selectedPath === null
          ? <div class="tt-empty">Select a task.</div>
          : <div class="tt-empty">Detail pane arrives in Task 11.</div>}
      </div>
    </div>
  );
}
