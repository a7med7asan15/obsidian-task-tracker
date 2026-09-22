import { App, Modal, Notice, Setting } from 'obsidian';
import { sortedSchema } from '../schema/validate';
import type { TaskTrackerSettings } from '../settings/types';

export class CreateTaskModal extends Modal {
  private title = '';
  private fields: Record<string, unknown> = {};

  constructor(
    app: App,
    private settings: TaskTrackerSettings,
    private onSubmit: (title: string, fields: Record<string, unknown>) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Create issue' });

    new Setting(contentEl)
      .setName('Title')
      .addText((t) => {
        t.setPlaceholder('Short summary').onChange((v) => { this.title = v; });
        window.setTimeout(() => t.inputEl.focus(), 0);
      });

    // Only required fields appear here; everything else is set in the detail pane.
    for (const def of sortedSchema(this.settings.schema).filter((f) => f.required)) {
      const setting = new Setting(contentEl).setName(def.label);
      if (def.type === 'select') {
        setting.addDropdown((d) => {
          d.addOption('', '—');
          for (const o of def.options ?? []) d.addOption(o, o);
          const first = (def.options ?? [])[0] ?? '';
          d.setValue(first);
          this.fields[def.key] = first || null;
          d.onChange((v) => { this.fields[def.key] = v || null; });
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
        this.onSubmit(this.title.trim(), this.fields);
        this.close();
      }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
