import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { render } from 'preact';
import type { TaskIndex } from '../index/taskIndex';
import type { TaskWriter } from '../write/writer';
import type { TaskTrackerSettings } from '../settings/types';
import { App } from './App';
import { Store } from './store';

export const VIEW_TYPE_TASK_TRACKER = 'task-tracker-view';

export class TaskTrackerView extends ItemView {
  private store = new Store();

  constructor(
    leaf: WorkspaceLeaf,
    private index: TaskIndex,
    private writer: TaskWriter,
    private settings: () => TaskTrackerSettings,
    private onCreate: () => void,
  ) {
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
    render(
      <App
        index={this.index}
        writer={this.writer}
        store={this.store}
        settings={this.settings}
        openAsNote={(path) => { void this.app.workspace.openLinkText(path, '', true); }}
        onCreate={this.onCreate}
      />,
      this.contentEl,
    );
  }

  async onClose(): Promise<void> {
    render(null, this.contentEl);
  }
}
