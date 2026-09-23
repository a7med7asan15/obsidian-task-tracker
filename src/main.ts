import { Notice, Plugin, TFile, type WorkspaceLeaf } from 'obsidian';
import { TaskIndex, type MetadataSource } from './index/taskIndex';
import { DEFAULT_SETTINGS, mergeSettings } from './settings/defaults';
import type { TaskTrackerSettings } from './settings/types';
import { ObsidianVaultAdapter } from './write/obsidianVault';
import { TaskWriter, sanitizeFilename } from './write/writer';
import { TaskTrackerView, VIEW_TYPE_TASK_TRACKER } from './ui/TaskTrackerView';
import { CreateTaskModal } from './ui/CreateTaskModal';
import { CreateProjectModal } from './ui/CreateProjectModal';
import { ProjectSettingsModal } from './ui/ProjectSettingsModal';
import { PROJECT_KEY } from './settings/projects';
import { ProjectRegistry } from './settings/projectRegistry';
import { noProjectScope, projectFilePath } from './settings/projectFile';
import { migrateLegacyProjects, withoutLegacyProjects, writeProjectFile } from './settings/migrate';
import { TaskTrackerSettingTab } from './settings/SettingsTab';

export default class TaskTrackerPlugin extends Plugin {
  settings: TaskTrackerSettings = DEFAULT_SETTINGS;
  index!: TaskIndex;
  writer!: TaskWriter;
  registry!: ProjectRegistry;
  vaultAdapter!: ObsidianVaultAdapter;

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
        return this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
      },
      read: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`No such file: ${path}`);
        return this.app.vault.read(file);
      },
    };

    this.registry = new ProjectRegistry(
      {
        markdownPaths: () => this.app.vault.getMarkdownFiles().map((f) => f.path),
        frontmatterOf: (path) => source.frontmatterOf(path),
      },
      () => this.settings,
    );
    this.index = new TaskIndex(source, () => this.registry.taskFolders());
    // A project appearing, moving or changing its tasks folder changes what the index scans.
    this.registry.onChange(() => { void this.index.rebuild(); });
    this.vaultAdapter = new ObsidianVaultAdapter(this.app);
    this.writer = new TaskWriter(this.vaultAdapter, () => this.settings);

    this.registerView(
      VIEW_TYPE_TASK_TRACKER,
      (leaf: WorkspaceLeaf) => new TaskTrackerView(leaf, {
        index: this.index,
        writer: this.writer,
        registry: this.registry,
        settings: () => this.settings,
        onCreate: (project) => this.openCreateModal(project),
        onCreateProject: () => this.openCreateProjectModal(),
        onProjectSettings: (project) => this.openProjectSettings(project),
      }),
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

    this.app.workspace.onLayoutReady(() => {
      void (async () => {
        await this.migrateProjects();
        this.registry.rebuild();
      })();
    });

    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      if (!this.registry.update(file.path)) void this.index.updateOne(file.path);
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      if (!this.registry.remove(file.path)) this.index.remove(file.path);
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (!this.registry.remove(oldPath)) this.index.remove(oldPath);
      if (!this.registry.update(file.path)) void this.index.updateOne(file.path);
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

  /** One-time move of legacy settings.projects into Settings/project.md files. */
  private async migrateProjects(): Promise<void> {
    if (this.settings.projects === undefined) return;
    const result = await migrateLegacyProjects(this.vaultAdapter, this.settings);
    if (result.failed.length > 0) {
      new Notice(
        'Task Tracker: some projects could not be moved into settings notes; '
        + `will retry next start.\n${result.failed.join('\n')}`,
      );
      return;
    }
    this.settings = withoutLegacyProjects(this.settings);
    await this.saveData(this.settings);
    if (result.created.length > 0) {
      new Notice(`Task Tracker: project settings now live in\n${result.created.join('\n')}`);
    }
  }

  views(): TaskTrackerView[] {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_TRACKER)
      .map((leaf) => leaf.view)
      .filter((v): v is TaskTrackerView => v instanceof TaskTrackerView);
  }

  /** Project shown in the first open tracker view, for commands run from the palette. */
  private currentProject(): string | null {
    return this.views()[0]?.currentProject() ?? null;
  }

  /** Project settings form, or plugin settings for "No project". */
  openProjectSettings(project: string | null): void {
    if (project === null) {
      const setting = (this.app as unknown as {
        setting?: { open(): void; openTabById(id: string): void };
      }).setting;
      setting?.open();
      setting?.openTabById(this.manifest.id);
      return;
    }
    new ProjectSettingsModal(this.app, this.registry, project, this.vaultAdapter).open();
  }

  openCreateModal(project: string | null = this.currentProject()): void {
    new CreateTaskModal(this.app, this.registry, project, ({ title, fields, project: chosen }) => {
      void (async () => {
        try {
          const scope = this.registry.scopeFor(chosen);
          const withProject = scope.name === null ? fields : { ...fields, [PROJECT_KEY]: scope.name };
          const path = await this.writer.createTask(
            title, withProject, this.index.ids(), scope.idPrefix, scope.tasksFolder,
          );
          await this.index.updateOne(path);
          for (const view of this.views()) view.selectTask(path);
        } catch (e) {
          new Notice(`Task Tracker: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
    }).open();
  }

  openCreateProjectModal(): void {
    const names = () => this.registry.all().map((p) => p.name ?? '');
    new CreateProjectModal(this.app, names, (name, idPrefix) => {
      void (async () => {
        try {
          const root = sanitizeFilename(name);
          const filePath = projectFilePath(root);
          if (await this.vaultAdapter.exists(filePath)) {
            new Notice(`Task Tracker: ${filePath} already exists.`);
            return;
          }
          const base = noProjectScope(this.settings);
          const tasksFolder = `${root}/Tasks`;
          await writeProjectFile(this.vaultAdapter, filePath, {
            ...base,
            name,
            filePath,
            idPrefix,
            tasksFolder,
            schema: base.schema.filter((f) => f.key !== PROJECT_KEY),
          });
          if (!this.app.vault.getAbstractFileByPath(tasksFolder)) {
            await this.app.vault.createFolder(tasksFolder).catch(() => undefined);
          }
          for (const view of this.views()) view.selectProject(name);
          new Notice(`Project "${name}" created. Its settings are in ${filePath}.`);
        } catch (e) {
          new Notice(`Task Tracker: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
    }).open();
  }
}
