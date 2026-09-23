import { isProjectFilePath, noProjectScope, parentOf, parseProjectFile } from './projectFile';
import type { ProjectScope, TaskTrackerSettings } from './types';

/** The metadata slice the registry needs. Backed by Obsidian's metadataCache. */
export interface ProjectFileSource {
  /** Every markdown path in the vault. */
  markdownPaths(): string[];
  frontmatterOf(path: string): Record<string, unknown> | null;
}

export interface ProjectWarning {
  /** The settings file the warning is about. */
  filePath: string;
  message: string;
}

/**
 * Every project defined by a `Settings/project.md` in the vault. The vault
 * is the source of truth: this only mirrors what the files say.
 */
export class ProjectRegistry {
  private projects = new Map<string, ProjectScope>();
  private fileWarnings = new Map<string, string[]>();
  private listeners = new Set<() => void>();

  constructor(
    private source: ProjectFileSource,
    private settings: () => TaskTrackerSettings,
  ) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  /** Re-read one file. True when what it defines (or its warnings) changed. */
  private load(path: string): boolean {
    const before = JSON.stringify([this.projects.get(path), this.fileWarnings.get(path)]);
    this.projects.delete(path);
    this.fileWarnings.delete(path);
    const { project, warnings } = parseProjectFile(path, this.source.frontmatterOf(path));
    if (project) this.projects.set(path, project);
    if (warnings.length > 0) this.fileWarnings.set(path, warnings);
    return JSON.stringify([this.projects.get(path), this.fileWarnings.get(path)]) !== before;
  }

  rebuild(): void {
    this.projects.clear();
    this.fileWarnings.clear();
    for (const path of this.source.markdownPaths()) {
      if (isProjectFilePath(path)) this.load(path);
    }
    this.emit();
  }

  /** Re-read one file. True when it is a settings-file path (handled here). */
  update(path: string): boolean {
    if (!isProjectFilePath(path)) return false;
    // Editing the note's body (or re-saving the same values) changes nothing here.
    if (this.load(path)) this.emit();
    return true;
  }

  /** Forget one file. True when it was a known settings file. */
  remove(path: string): boolean {
    const known = this.projects.delete(path) || this.fileWarnings.delete(path);
    this.fileWarnings.delete(path);
    if (known) this.emit();
    return known;
  }

  all(): ProjectScope[] {
    return [...this.projects.values()].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '') || (a.filePath ?? '').localeCompare(b.filePath ?? ''));
  }

  get(name: string): ProjectScope | undefined {
    return this.all().find((p) => p.name === name);
  }

  scopeFor(name: string | null): ProjectScope {
    const project = name === null ? undefined : this.get(name);
    return project ?? noProjectScope(this.settings());
  }

  scopeForPath(taskPath: string): ProjectScope {
    const folder = parentOf(taskPath);
    return this.all().find((p) => p.tasksFolder === folder) ?? noProjectScope(this.settings());
  }

  /** Folders the task index scans: the default one, then one per project. */
  taskFolders(): string[] {
    return [...new Set([this.settings().tasksFolder, ...this.all().map((p) => p.tasksFolder)])];
  }

  /**
   * Problems to show while `name` is the current project. "No project"
   * collects files that are marked as projects but could not be loaded.
   */
  warningsFor(name: string | null): ProjectWarning[] {
    const out: ProjectWarning[] = [];
    if (name === null) {
      for (const [filePath, messages] of this.fileWarnings) {
        if (this.projects.has(filePath)) continue;
        for (const message of messages) out.push({ filePath, message });
      }
      return out;
    }
    const project = this.get(name);
    if (!project || project.filePath === null) return out;
    for (const message of this.fileWarnings.get(project.filePath) ?? []) {
      out.push({ filePath: project.filePath, message });
    }
    for (const other of this.all()) {
      if (other.filePath === null || other.filePath === project.filePath) continue;
      if (other.idPrefix === project.idPrefix) {
        out.push({ filePath: other.filePath, message: `Also uses the ID prefix "${project.idPrefix}".` });
      }
      if (other.name === project.name) {
        out.push({ filePath: other.filePath, message: `Also named "${name}"; only one of them can be opened.` });
      }
    }
    return out;
  }
}
