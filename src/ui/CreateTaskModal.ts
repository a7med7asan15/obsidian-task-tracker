import { App, Modal, Notice, Setting } from 'obsidian';
import type { FieldDef, FieldValue } from '../schema/types';
import { sortedSchema } from '../schema/validate';
import type { ProjectRegistry } from '../settings/projectRegistry';

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
    default:
      return null;
  }
}

export interface CreateTaskResult {
  title: string;
  fields: Record<string, unknown>;
  /** Project chosen for this task, or null for none. */
  project: string | null;
}

export class CreateTaskModal extends Modal {
  private title = '';
  private fields: Record<string, unknown> = {};
  private fieldsEl: HTMLElement | null = null;

  constructor(
    app: App,
    private registry: ProjectRegistry,
    private project: string | null,
    private onSubmit: (result: CreateTaskResult) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Create issue' });

    new Setting(contentEl).setName('Title').addText((t) => {
      t.setPlaceholder('Short summary');
      t.inputEl.addClass('tt-modal-title-input');
      t.onChange((v) => { this.title = v; });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    const projects = this.registry.all();
    if (this.project !== null && !projects.some((p) => p.name === this.project)) this.project = null;
    if (projects.length > 0) {
      new Setting(contentEl)
        .setName('Project')
        .setDesc('Decides the ID prefix, the folder and which fields apply.')
        .addDropdown((d) => {
          d.addOption('', 'No project');
          for (const p of projects) {
            if (p.name !== null) d.addOption(p.name, `${p.name} (${p.idPrefix})`);
          }
          d.setValue(this.project ?? '');
          d.onChange((v) => {
            this.project = v === '' ? null : v;
            this.renderFields();
          });
        });
    }

    this.fieldsEl = contentEl.createDiv();
    this.renderFields();

    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Create').setCta().onClick(() => {
        if (this.title.trim().length === 0) {
          new Notice('A title is required.');
          return;
        }
        this.onSubmit({ title: this.title.trim(), fields: this.fields, project: this.project });
        this.close();
      }),
    );
  }

  /** (Re)build the field inputs for the chosen project's schema. */
  private renderFields(): void {
    const el = this.fieldsEl;
    if (!el) return;
    el.empty();
    const schema = sortedSchema(this.registry.scopeFor(this.project).schema);

    // Keep what was typed into fields the new project shares; default the rest.
    const previous = this.fields;
    this.fields = {};
    for (const def of schema) {
      this.fields[def.key] = def.key in previous ? previous[def.key] : defaultValueFor(def);
    }

    for (const def of schema) {
      const setting = new Setting(el).setName(def.label);
      if (def.required) setting.setDesc('Required');
      const current = this.fields[def.key];

      if (def.type === 'select') {
        setting.addDropdown((d) => {
          d.addOption('', '—');
          for (const o of def.options ?? []) d.addOption(o, o);
          d.setValue(typeof current === 'string' && (def.options ?? []).includes(current) ? current : '');
          d.onChange((v) => { this.fields[def.key] = v || null; });
        });
      } else if (def.type === 'multiselect') {
        const opts = def.options ?? [];
        const selected = new Set<string>(
          (Array.isArray(current) ? current.map(String) : []).filter((v) => opts.length === 0 || opts.includes(v)),
        );
        this.fields[def.key] = [...selected];
        if (opts.length === 0) {
          setting.addText((t) => {
            t.setPlaceholder('Comma, separated');
            t.setValue([...selected].join(', '));
            t.onChange((v) => {
              this.fields[def.key] = v.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
            });
          });
        } else if (opts.length > 8) {
          // Long lists (sprints, components, ...) as an add-dropdown plus removable pills.
          const pills = setting.controlEl.createDiv({ cls: 'tt-pills' });
          const redraw = () => {
            pills.empty();
            for (const v of selected) {
              const pill = pills.createSpan({ cls: 'tt-pill', text: v });
              const x = pill.createEl('button', { cls: 'tt-pill-x', text: '×' });
              x.addEventListener('click', () => {
                selected.delete(v);
                this.fields[def.key] = [...selected];
                redraw();
              });
            }
          };
          setting.addDropdown((d) => {
            d.addOption('', 'Add…');
            for (const o of opts) d.addOption(o, o);
            d.onChange((v) => {
              if (v !== '') selected.add(v);
              this.fields[def.key] = [...selected];
              d.setValue('');
              redraw();
            });
          });
          redraw();
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
          tg.setValue(current === true);
          tg.onChange((v) => { this.fields[def.key] = v; });
        });
      } else if (def.type === 'date') {
        setting.addText((t) => {
          t.inputEl.type = 'date';
          if (typeof current === 'string') t.setValue(current);
          t.onChange((v) => { this.fields[def.key] = v || null; });
        });
      } else if (def.type === 'number') {
        setting.addText((t) => {
          t.inputEl.type = 'number';
          if (typeof current === 'number') t.setValue(String(current));
          t.onChange((v) => { this.fields[def.key] = v === '' ? null : Number(v); });
        });
      } else {
        setting.addText((t) => {
          if (typeof current === 'string') t.setValue(current);
          t.onChange((v) => { this.fields[def.key] = v || null; });
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
