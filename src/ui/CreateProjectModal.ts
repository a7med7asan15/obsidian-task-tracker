import { App, Modal, Notice, Setting, type TextComponent } from 'obsidian';
import { suggestPrefix } from '../settings/projects';
import type { TaskTrackerSettings } from '../settings/types';

/** Modal for creating a new project: display name + ID prefix for its tasks. */
export class CreateProjectModal extends Modal {
  private name = '';
  private idPrefix = '';
  /** Once the user edits the prefix manually, stop auto-deriving from name. */
  private prefixTouched = false;
  private prefixComponent: TextComponent | null = null;

  constructor(
    app: App,
    private settings: TaskTrackerSettings,
    private onSubmit: (name: string, idPrefix: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Create project' });

    new Setting(contentEl)
      .setName('Name')
      .setDesc('Shown on tasks and in filters.')
      .addText((t) => {
        t.setPlaceholder('My project');
        t.inputEl.addClass('tt-modal-title-input');
        t.inputEl.focus();
        t.onChange((v) => {
          this.name = v;
          if (!this.prefixTouched) {
            this.idPrefix = suggestPrefix(v);
            this.prefixComponent?.setValue(this.idPrefix);
          }
        });
      });

    new Setting(contentEl)
      .setName('ID prefix')
      .setDesc('Each task in this project gets an ID starting with this prefix.')
      .addText((t) => {
        t.setPlaceholder('PROJ');
        this.prefixComponent = t;
        t.onChange((v) => {
          this.prefixTouched = true;
          this.idPrefix = v;
        });
      });

    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Create').setCta().onClick(() => {
        const name = this.name.trim();
        if (name.length === 0) {
          new Notice('A project name is required.');
          return;
        }
        if (this.settings.projects.some((p) => p.name === name)) {
          new Notice(`A project named "${name}" already exists.`);
          return;
        }
        const prefix = (this.idPrefix.trim() || suggestPrefix(name)).toUpperCase();
        this.onSubmit(name, prefix);
        this.close();
      }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
