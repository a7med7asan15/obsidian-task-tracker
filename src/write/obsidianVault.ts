import { TFile, TFolder, normalizePath, type App } from 'obsidian';
import type { VaultAdapter } from './vault';

export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private app: App) {}

  private fileAt(path: string): TFile {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(f instanceof TFile)) throw new Error(`Not a file: ${path}`);
    return f;
  }

  async read(path: string): Promise<string> {
    return this.app.vault.read(this.fileAt(path));
  }

  async write(path: string, content: string): Promise<void> {
    await this.app.vault.modify(this.fileAt(path), content);
  }

  async create(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const folder = normalized.slice(0, normalized.lastIndexOf('/'));
    if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
    await this.app.vault.create(normalized, content);
  }

  async rename(from: string, to: string): Promise<void> {
    await this.app.fileManager.renameFile(this.fileAt(from), normalizePath(to));
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  async list(folder: string): Promise<string[]> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(folder));
    if (!(f instanceof TFolder)) return [];
    return f.children.filter((c): c is TFile => c instanceof TFile).map((c) => c.path);
  }
}
