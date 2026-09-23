import { App, debounce, Notice, PluginSettingTab, Setting, type Debouncer } from 'obsidian';
import type TaskTrackerPlugin from '../main';
import { projectFolder } from './projects';
import type { FieldDef, FieldType } from '../schema/types';
import {
  addField, removeField, reorderField, sortedSchema, updateField, validateFieldDef,
} from '../schema/validate';

const TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'person'];

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

    for (const p of s.projects) {
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
          s.projects = s.projects.filter((x) => x !== p);
          await this.plugin.saveSettings();
        }));
    }

    new Setting(containerEl).setName('Status and dates').setHeading();

    new Setting(containerEl)
      .setName('Status field')
      .addDropdown((d) => {
        for (const f of s.schema.filter((f) => f.type === 'select')) d.addOption(f.key, f.label);
        d.setValue(s.statusFieldKey).onChange(async (v) => {
          s.statusFieldKey = v;
          await save();
        });
      });

    const statusField = s.schema.find((f) => f.key === s.statusFieldKey);
    for (const opt of statusField?.options ?? []) {
      new Setting(containerEl)
        .setName(`"${opt}" counts as done`)
        .addToggle((t) => t.setValue(s.doneStatuses.includes(opt)).onChange(async (on) => {
          s.doneStatuses = on
            ? [...new Set([...s.doneStatuses, opt])]
            : s.doneStatuses.filter((x) => x !== opt);
          await this.plugin.saveSettings();
        }));
    }

    new Setting(containerEl)
      .setName('Due date field')
      .setDesc('Drives the due / overdue badge.')
      .addDropdown((d) => {
        d.addOption('', 'None');
        for (const f of s.schema.filter((f) => f.type === 'date')) d.addOption(f.key, f.label);
        d.setValue(s.dueFieldKey ?? '').onChange(async (v) => {
          s.dueFieldKey = v === '' ? null : v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl).setName('Fields').setHeading();

    const sorted = sortedSchema(s.schema);
    sorted.forEach((f, i) => {
      new Setting(containerEl)
        .setName(`${f.label} (${f.type})`)
        .setDesc(`Key: ${f.key}${f.options?.length ? ` · ${f.options.join(', ')}` : ''}`)
        .addText((t) => t.setPlaceholder('Label').setValue(f.label).onChange((v) => {
          if (v.trim().length === 0) return;
          s.schema = updateField(s.schema, f.key, { label: v.trim() });
          this.debouncedSave();
        }))
        .addText((t) => t.setPlaceholder('Options, comma separated')
          .setValue((f.options ?? []).join(', '))
          .setDisabled(f.type !== 'select' && f.type !== 'multiselect')
          .onChange((v) => {
            const options = v.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
            s.schema = updateField(s.schema, f.key, { options });
            this.debouncedSave();
          }))
        .addToggle((t) => t.setTooltip('Show on list rows')
          .setValue(f.showInList === true)
          .onChange(async (on) => {
            s.schema = updateField(s.schema, f.key, { showInList: on });
            await this.plugin.saveSettings();
          }))
        .addButton((b) => b.setIcon('arrow-up').setDisabled(i === 0).onClick(async () => {
          s.schema = reorderField(s.schema, f.key, i - 1);
          await save();
        }))
        .addButton((b) => b.setIcon('arrow-down').setDisabled(i === sorted.length - 1)
          .onClick(async () => {
            s.schema = reorderField(s.schema, f.key, i + 1);
            await save();
          }))
        .addButton((b) => b.setIcon('trash').setWarning().onClick(async () => {
          if (f.key === s.statusFieldKey) {
            new Notice('Pick a different status field before deleting this one.');
            return;
          }
          s.schema = removeField(s.schema, f.key);
          if (s.dueFieldKey === f.key) s.dueFieldKey = null;
          await save();
        }));
    });

    new Setting(containerEl).setName('Add a field').setHeading();

    let newKey = '';
    let newLabel = '';
    let newType: FieldType = 'text';
    let newOptions = '';

    new Setting(containerEl)
      .setName('New field')
      .setDesc('Key becomes the frontmatter key and cannot be changed later.')
      .addText((t) => t.setPlaceholder('key').onChange((v) => { newKey = v.trim(); }))
      .addText((t) => t.setPlaceholder('Label').onChange((v) => { newLabel = v.trim(); }))
      .addDropdown((d) => {
        for (const t of TYPES) d.addOption(t, t);
        d.setValue('text').onChange((v) => { newType = v as FieldType; });
      })
      .addText((t) => t.setPlaceholder('options, comma separated')
        .onChange((v) => { newOptions = v; }))
      .addButton((b) => b.setButtonText('Add').setCta().onClick(async () => {
        const def: FieldDef = {
          key: newKey,
          label: newLabel || newKey,
          type: newType,
          options: newOptions.split(',').map((x) => x.trim()).filter((x) => x.length > 0),
          order: s.schema.length,
        };
        const errors = validateFieldDef(def, s.schema);
        if (errors.length > 0) {
          new Notice(errors.join('\n'));
          return;
        }
        s.schema = addField(s.schema, def);
        await save();
      }));

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
