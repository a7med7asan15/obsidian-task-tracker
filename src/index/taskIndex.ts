import { parseTask } from '../model/parse';
import type { Task } from '../model/types';

/** The metadata slice the index needs. Backed by Obsidian's metadataCache. */
export interface MetadataSource {
  /** Vault-relative markdown paths directly inside `folder`. */
  pathsIn(folder: string): string[];
  frontmatterOf(path: string): Record<string, unknown> | null;
  read(path: string): Promise<string>;
}

export class TaskIndex {
  private tasks = new Map<string, Task>();
  private listeners = new Set<() => void>();

  constructor(
    private source: MetadataSource,
    private tasksFolder: () => string,
  ) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  private inFolder(path: string): boolean {
    return path.startsWith(`${this.tasksFolder()}/`);
  }

  /** Frontmatter only — deliberately does not read file bodies. */
  private indexOne(path: string): void {
    const fm = this.source.frontmatterOf(path) ?? {};
    this.tasks.set(path, parseTask(path, fm, ''));
  }

  async rebuild(): Promise<void> {
    this.tasks.clear();
    for (const path of this.source.pathsIn(this.tasksFolder())) {
      this.indexOne(path);
    }
    this.emit();
  }

  async updateOne(path: string): Promise<void> {
    if (!this.inFolder(path)) return;
    this.indexOne(path);
    this.emit();
  }

  remove(path: string): void {
    if (this.tasks.delete(path)) this.emit();
  }

  /** Read the file and fill in description and comments for one task. */
  async loadBody(path: string): Promise<Task | undefined> {
    if (!this.inFolder(path)) return undefined;
    const fm = this.source.frontmatterOf(path) ?? {};
    const content = await this.source.read(path);
    const task = parseTask(path, fm, content);
    this.tasks.set(path, task);
    this.emit();
    return task;
  }

  all(): Task[] {
    return [...this.tasks.values()];
  }

  get(path: string): Task | undefined {
    return this.tasks.get(path);
  }

  ids(): string[] {
    return this.all().map((t) => t.id).filter((id): id is string => id !== null);
  }

  /** Ids claimed by more than one file. The detail pane warns on these. */
  duplicateIds(): Set<string> {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const id of this.ids()) {
      if (seen.has(id)) dupes.add(id);
      else seen.add(id);
    }
    return dupes;
  }
}
