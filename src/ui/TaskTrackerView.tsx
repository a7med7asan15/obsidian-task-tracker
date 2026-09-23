import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { render } from 'preact';
import type { TaskIndex } from '../index/taskIndex';
import type { TaskWriter } from '../write/writer';
import type { TaskTrackerSettings } from '../settings/types';
import type { ProjectRegistry } from '../settings/projectRegistry';
import { App } from './App';
import { Store } from './store';

export const VIEW_TYPE_TASK_TRACKER = 'task-tracker-view';

const PROJECT_KEY_STORAGE = 'task-tracker-project';

function loadProject(): string | null {
  try {
    return window.localStorage.getItem(PROJECT_KEY_STORAGE) || null;
  } catch {
    return null;
  }
}

function saveProject(name: string | null): void {
  try {
    if (name === null) window.localStorage.removeItem(PROJECT_KEY_STORAGE);
    else window.localStorage.setItem(PROJECT_KEY_STORAGE, name);
  } catch { /* ignore */ }
}

export interface ViewDeps {
  index: TaskIndex;
  writer: TaskWriter;
  registry: ProjectRegistry;
  settings: () => TaskTrackerSettings;
  onCreate: (project: string | null) => void;
  onCreateProject: () => void;
  onProjectSettings: (project: string | null) => void;
}

export class TaskTrackerView extends ItemView {
  private store = new Store(loadProject());
  private offStore: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, private deps: ViewDeps) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TASK_TRACKER;
  }

  getDisplayText(): string {
    return 'Task Tracker';
  }

  getIcon(): string {
    return 'check-square';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('task-tracker-view');
    this.offStore = this.store.subscribe(() => saveProject(this.store.getState().project));
    render(
      <App
        {...this.deps}
        store={this.store}
        openAsNote={(path) => { void this.app.workspace.openLinkText(path, '', true); }}
      />,
      this.contentEl,
    );
  }

  async onClose(): Promise<void> {
    this.offStore?.();
    render(null, this.contentEl);
  }

  selectTask(path: string): void {
    this.store.select(path);
  }

  currentProject(): string | null {
    return this.store.getState().project;
  }

  selectProject(name: string | null): void {
    this.store.setProject(name, this.deps.registry.scopeFor(name).schema.map((f) => f.key));
  }
}
