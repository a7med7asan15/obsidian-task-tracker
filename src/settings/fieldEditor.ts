import { Notice, Setting } from 'obsidian';
import type { FieldDef, FieldType } from '../schema/types';
import {
  addField, removeField, reorderField, sortedSchema, updateField, validateFieldDef,
} from '../schema/validate';
import { pickFieldConfig, type FieldConfig } from './fieldConfig';

const TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'person'];

/**
 * Status, due-date and field settings, shared by plugin settings ("No
 * project") and each project's settings form. `onChange` receives the whole
 * updated config. `redraw` is true when the editor's own layout depends on
 * the change and false for edits made while typing, which the caller should
 * debounce.
 */
export function renderFieldEditor(
  el: HTMLElement,
  config: FieldConfig,
  onChange: (next: FieldConfig, redraw: boolean) => void,
): void {
  let c = pickFieldConfig(config);
  const emit = (patch: Partial<FieldConfig>, redraw: boolean) => {
    c = { ...c, ...patch };
    onChange(c, redraw);
  };

  new Setting(el).setName('Status and dates').setHeading();

  new Setting(el)
    .setName('Status field')
    .addDropdown((d) => {
      for (const f of c.schema.filter((f) => f.type === 'select')) d.addOption(f.key, f.label);
      d.setValue(c.statusFieldKey).onChange((v) => emit({ statusFieldKey: v }, true));
    });

  const statusField = c.schema.find((f) => f.key === c.statusFieldKey);
  for (const opt of statusField?.options ?? []) {
    new Setting(el)
      .setName(`"${opt}" counts as done`)
      .addToggle((t) => t.setValue(c.doneStatuses.includes(opt)).onChange((on) => {
        emit({
          doneStatuses: on
            ? [...new Set([...c.doneStatuses, opt])]
            : c.doneStatuses.filter((x) => x !== opt),
        }, false);
      }));
  }

  new Setting(el)
    .setName('Due date field')
    .setDesc('Drives the due / overdue badge.')
    .addDropdown((d) => {
      d.addOption('', 'None');
      for (const f of c.schema.filter((f) => f.type === 'date')) d.addOption(f.key, f.label);
      d.setValue(c.dueFieldKey ?? '').onChange((v) => emit({ dueFieldKey: v === '' ? null : v }, false));
    });

  new Setting(el).setName('Fields').setHeading();

  const sorted = sortedSchema(c.schema);
  sorted.forEach((f, i) => {
    new Setting(el)
      .setName(`${f.label} (${f.type})`)
      .setDesc(`Key: ${f.key}${f.options?.length ? ` · ${f.options.join(', ')}` : ''}`)
      .addText((t) => t.setPlaceholder('Label').setValue(f.label).onChange((v) => {
        if (v.trim().length === 0) return;
        emit({ schema: updateField(c.schema, f.key, { label: v.trim() }) }, false);
      }))
      .addText((t) => t.setPlaceholder('Options, comma separated')
        .setValue((f.options ?? []).join(', '))
        .setDisabled(f.type !== 'select' && f.type !== 'multiselect')
        .onChange((v) => {
          const options = v.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
          emit({ schema: updateField(c.schema, f.key, { options }) }, false);
        }))
      .addToggle((t) => t.setTooltip('Show on list rows')
        .setValue(f.showInList === true)
        .onChange((on) => emit({ schema: updateField(c.schema, f.key, { showInList: on }) }, false)))
      .addButton((b) => b.setIcon('arrow-up').setDisabled(i === 0).onClick(() => {
        emit({ schema: reorderField(c.schema, f.key, i - 1) }, true);
      }))
      .addButton((b) => b.setIcon('arrow-down').setDisabled(i === sorted.length - 1).onClick(() => {
        emit({ schema: reorderField(c.schema, f.key, i + 1) }, true);
      }))
      .addButton((b) => b.setIcon('trash').setWarning().onClick(() => {
        if (f.key === c.statusFieldKey) {
          new Notice('Pick a different status field before deleting this one.');
          return;
        }
        emit({
          schema: removeField(c.schema, f.key),
          dueFieldKey: c.dueFieldKey === f.key ? null : c.dueFieldKey,
        }, true);
      }));
  });

  new Setting(el).setName('Add a field').setHeading();

  let newKey = '';
  let newLabel = '';
  let newType: FieldType = 'text';
  let newOptions = '';

  new Setting(el)
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
    .addButton((b) => b.setButtonText('Add').setCta().onClick(() => {
      const def: FieldDef = {
        key: newKey,
        label: newLabel || newKey,
        type: newType,
        options: newOptions.split(',').map((x) => x.trim()).filter((x) => x.length > 0),
        order: c.schema.length,
      };
      const errors = validateFieldDef(def, c.schema);
      if (errors.length > 0) {
        new Notice(errors.join('\n'));
        return;
      }
      emit({ schema: addField(c.schema, def) }, true);
    }));
}
