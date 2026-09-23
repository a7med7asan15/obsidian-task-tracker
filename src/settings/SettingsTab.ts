import { App, debounce, Notice, PluginSettingTab, Setting, type Debouncer } from 'obsidian';
import type TaskTrackerPlugin from '../main';
import { orphanKeys } from './orphans';
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
      .setDesc('Flat folder for tasks without a project.')
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
      .setDesc('Each project keeps its ID prefix, folder and fields in <project>/Settings/project.md. Open it from the ⚙ next to the project picker.')
      .addButton((b) => b.setButtonText('Create project').setCta()
        .onClick(() => this.plugin.openCreateProjectModal()));

    new Setting(containerEl).setName('Fields for tasks without a project').setHeading();

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
        const orphans = orphanKeys(
          this.plugin.index.all(),
          (path) => this.plugin.registry.scopeForPath(path),
        );
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
