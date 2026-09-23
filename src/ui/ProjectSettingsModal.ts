import { App, debounce, Modal, Setting } from 'obsidian';
import { renderFieldEditor } from '../settings/fieldEditor';
import {
  projectRoot, relativeTasksFolder, resolveTasksFolder, serializeProjectFrontmatter,
} from '../settings/projectFile';
import type { ProjectRegistry } from '../settings/projectRegistry';
import type { ProjectScope } from '../settings/types';
import type { VaultAdapter } from '../write/vault';

/**
 * Edits one project's Settings/project.md. The file stays the source of
 * truth: every change is written back to its frontmatter, and a hand edit
 * made elsewhere redraws the form.
 */
export class ProjectSettingsModal extends Modal {
  /** Latest edits, ahead of the file until the metadata cache catches up. */
  private pending: ProjectScope | null = null;
  private dirty = false;
  private offRegistry: (() => void) | null = null;
  private flush = debounce(() => { void this.write(); }, 400, true);

  constructor(
    app: App,
    private registry: ProjectRegistry,
    private projectName: string,
    private vault: VaultAdapter,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(`Project settings: ${this.projectName}`);
    this.render();
    this.offRegistry = this.registry.onChange(() => {
      if (!this.dirty) this.pending = null;
      // Our own saves come back through here as well: don't redraw under the cursor.
      if (this.contentEl.contains(this.contentEl.ownerDocument.activeElement)) return;
      this.render();
    });
  }

  onClose(): void {
    this.flush.run();
    this.offRegistry?.();
    this.contentEl.empty();
  }

  private current(): ProjectScope | undefined {
    return this.pending ?? this.registry.get(this.projectName);
  }

  private change(next: ProjectScope, redraw: boolean): void {
    this.pending = next;
    this.dirty = true;
    this.flush();
    if (redraw) this.render();
  }

  private async write(): Promise<void> {
    const next = this.pending;
    if (!next || next.filePath === null) return;
    await this.vault.processFrontmatter(next.filePath, (fm) => {
      Object.assign(fm, serializeProjectFrontmatter(next));
    });
    if (this.pending === next) this.dirty = false;
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const scope = this.current();
    if (!scope || scope.filePath === null) {
      contentEl.createEl('p', { text: 'This project no longer exists.' });
      return;
    }
    const filePath = scope.filePath;
    const root = projectRoot(filePath);

    new Setting(contentEl)
      .setName('Settings note')
      .setDesc(filePath)
      .addButton((b) => b.setButtonText('Open').onClick(() => {
        this.close();
        void this.app.workspace.openLinkText(filePath, '', true);
      }));

    new Setting(contentEl)
      .setName('ID prefix')
      .setDesc('New tasks are numbered with this prefix; existing tasks keep theirs.')
      .addText((t) => t.setValue(scope.idPrefix).onChange((v) => {
        const prefix = v.trim().toUpperCase();
        const cur = this.current();
        if (prefix !== '' && cur) this.change({ ...cur, idPrefix: prefix }, false);
      }));

    new Setting(contentEl)
      .setName('Tasks folder')
      .setDesc('Relative to the project folder. Start with / for a path from the vault root.')
      .addText((t) => t.setValue(relativeTasksFolder(root, scope.tasksFolder)).onChange((v) => {
        const cur = this.current();
        if (cur) this.change({ ...cur, tasksFolder: resolveTasksFolder(root, v) }, false);
      }));

    renderFieldEditor(contentEl, scope, (next, redraw) => {
      const cur = this.current();
      if (cur) this.change({ ...cur, ...next }, redraw);
    });
  }
}
