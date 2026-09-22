import { App, Modal, Notice, Setting } from 'obsidian';
import type { FieldDef, FieldValue } from '../schema/types';
import { sortedSchema } from '../schema/validate';
import { PROJECT_KEY } from '../settings/projects';
import type { TaskTrackerSettings } from '../settings/types';

/** Sensible initial value for a field type so the form opens pre-filled. */
function defaultValueFor(def: FieldDef): FieldValue {
  switch (def.type) {
    case 'select': {
      const opts = def.options ?? [];
      return opts.length > 0 ? opts[0] : null;
    }
    case 'multiselect':
      return [];
    case 'checkbox':
      return false;
    case 'number':
      return null;
    default:
      return null;
  }
}

export interface CreateTaskResult {
  title: string;
  fields: Record<string, unknown>;
  /** Project name chosen for this task, or '' when none. */
  project: string;
}

export class CreateTaskModal extends Modal {
  private title = '';
  private fields: Record<string, unknown> = {};
  private project = '';

  constructor(
    app: App,
    private settings: TaskTrackerSettings,
    private onSubmit: (result: CreateTaskResult) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Create issue' });

    const title = new Setting(contentEl).setName('Title');
    title.addText((t) => {
      t.setPlaceholder('Short summary');
      t.inputEl.addClass('tt-modal-title-input');
      t.onChange((v) => { this.title = v; });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    const schema = sortedSchema(this.settings.schema);

    // Pre-fill every field with a type-appropriate default.
    for (const def of schema) {
      this.fields[def.key] = defaultValueFor(def);
    }

    // Project picker: choosing one stamps `project` and drives the ID prefix.
    if (this.settings.projects.length > 0) {
      const first = this.settings.projects[0];
      this.project = first.name;
      if (this.fields[PROJECT_KEY] === undefined || this.fields[PROJECT_KEY] === null) {
        this.fields[PROJECT_KEY] = first.name;
      }
      new Setting(contentEl)
        .setName('Project')
        .setDesc(`IDs start with this project's prefix, e.g. ${first.idPrefix}-1.`)
        .addDropdown((d) => {
          d.addOption('', '— no project —');
          for (const p of this.settings.projects) d.addOption(p.name, `${p.name} (${p.idPrefix})`);
          d.setValue(this.project);
          d.onChange((v) => {
            this.project = v;
            this.fields[PROJECT_KEY] = v || null;
          });
        });
    }

    // All schema fields appear here (required ones first via sorted order);
    // the detail pane remains available for edits after creation.
    for (const def of schema) {
      if (def.key === PROJECT_KEY && this.settings.projects.length > 0) continue;
      const setting = new Setting(contentEl).setName(def.label);
      if (def.required) setting.setDesc('Required');

      if (def.type === 'select') {
        setting.addDropdown((d) => {
          d.addOption('', '—');
          for (const o of def.options ?? []) d.addOption(o, o);
          const initial = (this.fields[def.key] as string | null) ?? '';
          d.setValue(initial);
          d.onChange((v) => { this.fields[def.key] = v || null; });
        });
      } else if (def.type === 'multiselect') {
        const selected = new Set<string>(this.fields[def.key] as string[]);
        const opts = def.options ?? [];
        if (opts.length === 0) {
          setting.addText((t) => {
            t.setPlaceholder('Comma, separated');
            t.onChange((v) => {
              this.fields[def.key] = v.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
            });
          });
        } else {
          const wrap = setting.controlEl.createDiv({ cls: 'tt-multiselect' });
          for (const o of opts) {
            const label = wrap.createEl('label');
            const cb = label.createEl('input', { type: 'checkbox' });
            cb.checked = selected.has(o);
            cb.addEventListener('change', () => {
              if (cb.checked) selected.add(o);
              else selected.delete(o);
              this.fields[def.key] = [...selected];
            });
            label.appendText(o);
          }
        }
      } else if (def.type === 'checkbox') {
        setting.addToggle((tg) => {
          tg.setValue(this.fields[def.key] === true);
          tg.onChange((v) => { this.fields[def.key] = v; });
        });
      } else if (def.type === 'date') {
        setting.addText((t) => {
          t.inputEl.type = 'date';
          t.onChange((v) => { this.fields[def.key] = v || null; });
        });
      } else if (def.type === 'number') {
        setting.addText((t) => {
          t.inputEl.type = 'number';
          t.onChange((v) => { this.fields[def.key] = v === '' ? null : Number(v); });
        });
      } else {
        setting.addText((t) => t.onChange((v) => { this.fields[def.key] = v || null; }));
      }
    }

    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Create').setCta().onClick(() => {
        if (this.title.trim().length === 0) {
          new Notice('A title is required.');
          return;
        }
        this.onSubmit({
          title: this.title.trim(),
          fields: this.fields,
          project: this.project,
        });
        this.close();
      }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
