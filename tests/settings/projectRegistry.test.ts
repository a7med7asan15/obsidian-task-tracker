import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectRegistry, type ProjectFileSource } from '../../src/settings/projectRegistry';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';

class FakeSource implements ProjectFileSource {
  files = new Map<string, Record<string, unknown> | null>();
  markdownPaths() { return [...this.files.keys()]; }
  frontmatterOf(path: string) { return this.files.get(path) ?? null; }
}

const STATUS = { key: 'status', label: 'Status', type: 'select', options: ['To Do', 'Done'] };
const project = (name: string, idPrefix: string, extra: Record<string, unknown> = {}) =>
  ({ 'tt-project': name, idPrefix, fields: [STATUS], ...extra });

let source: FakeSource;
let registry: ProjectRegistry;

beforeEach(() => {
  source = new FakeSource();
  source.files.set('Beta/Settings/project.md', project('Beta', 'BET'));
  source.files.set('Alpha/Settings/project.md', project('Alpha', 'ALP'));
  source.files.set('Notes/Settings/project.md', { title: 'not a project' });
  source.files.set('Alpha/Tasks/ALP-1 A.md', { id: 'ALP-1' });
  registry = new ProjectRegistry(source, () => DEFAULT_SETTINGS);
  registry.rebuild();
});

describe('ProjectRegistry', () => {
  it('finds marked settings files, sorted by name', () => {
    expect(registry.all().map((p) => p.name)).toEqual(['Alpha', 'Beta']);
  });

  it('scans the default folder plus each project folder', () => {
    expect(registry.taskFolders()).toEqual(['Tasks', 'Alpha/Tasks', 'Beta/Tasks']);
  });

  it('scopeFor falls back to "No project" for null or an unknown name', () => {
    expect(registry.scopeFor('Alpha').idPrefix).toBe('ALP');
    expect(registry.scopeFor(null).name).toBeNull();
    expect(registry.scopeFor('Gone').name).toBeNull();
    expect(registry.scopeFor(null).tasksFolder).toBe('Tasks');
  });

  it('scopeForPath picks the project whose tasks folder holds the task', () => {
    expect(registry.scopeForPath('Alpha/Tasks/ALP-1 A.md').name).toBe('Alpha');
    expect(registry.scopeForPath('Tasks/TASK-1 A.md').name).toBeNull();
  });

  it('update re-reads a settings file and reports it; other files are ignored', () => {
    const cb = vi.fn();
    registry.onChange(cb);
    source.files.set('Alpha/Settings/project.md', project('Alpha', 'AL2'));
    expect(registry.update('Alpha/Settings/project.md')).toBe(true);
    expect(registry.get('Alpha')?.idPrefix).toBe('AL2');
    expect(registry.update('Alpha/Tasks/ALP-1 A.md')).toBe(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('picks up a newly created settings file', () => {
    source.files.set('Gamma/Settings/project.md', project('Gamma', 'GAM'));
    registry.update('Gamma/Settings/project.md');
    expect(registry.get('Gamma')?.tasksFolder).toBe('Gamma/Tasks');
  });

  it('follows a folder rename: remove old path, update new path, same name', () => {
    source.files.delete('Alpha/Settings/project.md');
    source.files.set('Renamed/Settings/project.md', project('Alpha', 'ALP'));
    expect(registry.remove('Alpha/Settings/project.md')).toBe(true);
    registry.update('Renamed/Settings/project.md');
    expect(registry.get('Alpha')?.tasksFolder).toBe('Renamed/Tasks');
    expect(registry.all()).toHaveLength(2);
  });

  it('remove returns false for a path it does not know', () => {
    expect(registry.remove('Alpha/Tasks/ALP-1 A.md')).toBe(false);
  });

  it('reports parse warnings for a project', () => {
    source.files.set('Alpha/Settings/project.md', project('Alpha', 'ALP', { fields: [STATUS, { key: 'x' }] }));
    registry.update('Alpha/Settings/project.md');
    const warnings = registry.warningsFor('Alpha');
    expect(warnings.map((w) => w.filePath)).toEqual(['Alpha/Settings/project.md']);
    expect(warnings[0].message).toContain('"x"');
  });

  it('reports marked-but-unusable files under "No project"', () => {
    source.files.set('Broken/Settings/project.md', { 'tt-project': 'Broken' });
    registry.update('Broken/Settings/project.md');
    expect(registry.get('Broken')).toBeUndefined();
    expect(registry.warningsFor(null).map((w) => w.filePath)).toEqual(['Broken/Settings/project.md']);
  });

  it('warns about a shared ID prefix on both projects', () => {
    source.files.set('Beta/Settings/project.md', project('Beta', 'ALP'));
    registry.update('Beta/Settings/project.md');
    expect(registry.warningsFor('Alpha')).toEqual([
      { filePath: 'Beta/Settings/project.md', message: 'Also uses the ID prefix "ALP".' },
    ]);
    expect(registry.warningsFor('Beta')[0].filePath).toBe('Alpha/Settings/project.md');
  });

  it('does not emit when a settings file changes but its project does not', () => {
    const cb = vi.fn();
    registry.onChange(cb);
    source.files.set('Alpha/Settings/project.md', project('Alpha', 'ALP'));
    expect(registry.update('Alpha/Settings/project.md')).toBe(true);
    expect(cb).not.toHaveBeenCalled();
  });
});
