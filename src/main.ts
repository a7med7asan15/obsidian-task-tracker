import { Notice, Plugin, TFile, type WorkspaceLeaf } from 'obsidian';
import { TaskIndex, type MetadataSource } from './index/taskIndex';
import { DEFAULT_SETTINGS, mergeSettings } from './settings/defaults';
import type { TaskTrackerSettings } from './settings/types';
import { ObsidianVaultAdapter } from './write/obsidianVault';
import { TaskWriter } from './write/writer';
import { TaskTrackerView, VIEW_TYPE_TASK_TRACKER } from './ui/TaskTrackerView';
import { CreateTaskModal } from './ui/CreateTaskModal';
import { CreateProjectModal } from './ui/CreateProjectModal';
import { ensureProjectField, prefixForProject } from './settings/projects';
import { TaskTrackerSettingTab } from './settings/SettingsTab';

export default class TaskTrackerPlugin extends Plugin {
  settings: TaskTrackerSettings = DEFAULT_SETTINGS;
  index!: TaskIndex;
  writer!: TaskWriter;

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());

    const source: MetadataSource = {
      pathsIn: (folder) =>
        this.app.vault.getMarkdownFiles()
          .filter((f) => f.parent?.path === folder)
          .map((f) => f.path),
      frontmatterOf: (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        return (this.app.metadataCache.getFileCache(file)?.frontmatter ?? null) as
          Record<string, unknown> | null;
      },
      read: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`No such file: ${path}`);
        return this.app.vault.read(file);
      },
    };

    this.index = new TaskIndex(source, () => this.settings.tasksFolder);
    this.writer = new TaskWriter(new ObsidianVaultAdapter(this.app), () => this.settings);

    this.registerView(
      VIEW_TYPE_TASK_TRACKER,
      (leaf: WorkspaceLeaf) =>
        new TaskTrackerView(
          leaf,
          this.index,
          this.writer,
          () => this.settings,
          () => this.openCreateModal(),
          () => this.openCreateProjectModal(),
        ),
    );

    this.addRibbonIcon('check-square', 'Open Task Tracker', () => { void this.activateView(); });
    this.addCommand({
      id: 'open-task-tracker',
      name: 'Open Task Tracker',
      callback: () => { void this.activateView(); },
    });
    this.addCommand({
      id: 'create-task',
      name: 'Create issue',
      callback: () => this.openCreateModal(),
    });
    this.addCommand({
      id: 'create-project',
      name: 'Create project',
      callback: () => this.openCreateProjectModal(),
    });

    this.addSettingTab(new TaskTrackerSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => { void this.index.rebuild(); });

    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      void this.index.updateOne(file.path);
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      this.index.remove(file.path);
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.index.remove(oldPath);
      void this.index.updateOne(file.path);
    }));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await this.index.rebuild();
  }

  /** Focus an existing Task Tracker tab, or open one. */
  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_TRACKER);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_TASK_TRACKER, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  openCreateModal(): void {
    new CreateTaskModal(this.app, this.settings, ({ title, fields, project }) => {
      void (async () => {
        try {
          const prefix = prefixForProject(this.settings, project);
          const path = await this.writer.createTask(title, fields, this.index.ids(), prefix);
          await this.index.updateOne(path);
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_TRACKER);
          for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof TaskTrackerView) view.selectTask(path);
          }
        } catch (e) {
          new Notice(`Task Tracker: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
    }).open();
  }

  openCreateProjectModal(): void {
    new CreateProjectModal(this.app, this.settings, (name, idPrefix) => {
      void (async () => {
        this.settings.projects = [...this.settings.projects, { name, idPrefix }];
        this.settings.schema = ensureProjectField(this.settings.schema, this.settings.projects);
        await this.saveSettings();
        new Notice(`Project "${name}" created. Tasks will get ${idPrefix}-1, ${idPrefix}-2, …`);
      })();
    }).open();
  }
}
