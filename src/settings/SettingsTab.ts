import { App, debounce, Notice, PluginSettingTab, Setting, type Debouncer } from 'obsidian';
import type TaskTrackerPlugin from '../main';
import { projectFolder } from './projects';
import { renderFieldEditor } from './fieldEditor';

export class TaskTrackerSettingTab extends PluginSettingTab {
  /**
   * `saveSettings()` does a disk write plus a full `index.rebuild()` and
   * change-event emit — expensive to run on every keystroke. Text inputs
   * below debounce through this instead of saving on every `onChange`, so
   * typing (e.g. into "Tasks folder") doesn't re-index against every
   * partial string. `resetTimer: true` restarts the wait on each call, so
   * the save only fires once typing pauses.
   */
  private debouncedSave: Debouncer<[], void>;

  constructor(app: App, private plugin: TaskTrackerPlugin) {
    super(app, plugin);
    this.debouncedSave = debounce(() => { void this.plugin.saveSettings(); }, 400, true);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    const save = async () => {
      await this.plugin.saveSettings();
      this.display();
    };

    new Setting(containerEl)
      .setName('Tasks folder')
      .setDesc('Flat folder for tasks without a project. Project tasks live in <project>/Tasks.')
      .addText((t) => t.setValue(s.tasksFolder).onChange((v) => {
        s.tasksFolder = v.trim() || 'Tasks';
        this.debouncedSave();
      }));

    new Setting(containerEl)
      .setName('ID prefix')
      .setDesc('Task IDs are <prefix>-<number>.')
      .addText((t) => t.setValue(s.idPrefix).onChange((v) => {
        s.idPrefix = v.trim().toUpperCase() || 'TASK';
        this.debouncedSave();
      }));

    new Setting(containerEl)
      .setName('Your name')
      .setDesc('Author stamped on comments.')
      .addText((t) => t.setValue(s.authorName).onChange((v) => {
        s.authorName = v.trim() || 'Me';
        this.debouncedSave();
      }));

    new Setting(containerEl).setName('Projects').setHeading();

    new Setting(containerEl)
      .setName('Create project')
      .setDesc('Projects give their tasks a shared ID prefix, so tasks number per project.')
      .addButton((b) => b.setButtonText('Create project').setCta()
        .onClick(() => this.plugin.openCreateProjectModal()));

    for (const p of s.projects ?? []) {
      new Setting(containerEl)
        .setName(p.name)
        .setDesc(`Task IDs start with ${p.idPrefix}-. Tasks live in ${projectFolder(p)}/.`)
        .addText((t) => t.setPlaceholder('Prefix').setValue(p.idPrefix).onChange((v) => {
          p.idPrefix = v.trim().toUpperCase() || p.idPrefix;
          this.debouncedSave();
        }))
        .addText((t) => t.setPlaceholder(`${p.name}/Tasks`).setValue(p.folder ?? '').onChange((v) => {
          p.folder = v.trim() || undefined;
          this.debouncedSave();
        }))
        .addButton((b) => b.setButtonText('Delete').setWarning().onClick(async () => {
          s.projects = (s.projects ?? []).filter((x) => x !== p);
          await this.plugin.saveSettings();
        }));
    }

    renderFieldEditor(containerEl, s, (next, redraw) => {
      Object.assign(s, next);
      if (redraw) void save();
      else this.debouncedSave();
    });

    new Setting(containerEl).setName('Maintenance').setHeading();

    new Setting(containerEl)
      .setName('Clean up orphaned frontmatter keys')
      .setDesc('Find frontmatter keys on tasks that no longer match any field, and remove them.')
      .addButton((b) => b.setButtonText('Scan').onClick(async () => {
        const known = new Set([
          'id', 'title', 'created', 'updated', ...s.schema.map((f) => f.key),
        ]);
        const orphans = new Map<string, string[]>();
        for (const task of this.plugin.index.all()) {
          for (const key of Object.keys(task.fields)) {
            if (known.has(key)) continue;
            orphans.set(key, [...(orphans.get(key) ?? []), task.path]);
          }
        }
        if (orphans.size === 0) {
          new Notice('No orphaned keys found.');
          return;
        }
        const summary = [...orphans.entries()]
          .map(([k, paths]) => `${k} (${paths.length})`).join(', ');
        const ok = window.confirm(
          `Remove these keys from every task?\n\n${summary}\n\nThis cannot be undone.`,
        );
        if (!ok) return;
        for (const [key, paths] of orphans) {
          for (const path of paths) {
            await this.plugin.writer.setField(path, key, null);
          }
        }
        await this.plugin.index.rebuild();
        new Notice(`Removed ${orphans.size} orphaned key(s).`);
      }));
  }
}
