import { describe, expect, it } from 'vitest';
import {
  PROJECT_FILE_BODY, migrateLegacyProjects, withoutLegacyProjects,
} from '../../src/settings/migrate';
import { parseProjectFile } from '../../src/settings/projectFile';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import type { VaultAdapter } from '../../src/write/vault';
import type { TaskTrackerSettings } from '../../src/settings/types';

/** Keeps frontmatter as an object beside the body, like Obsidian's parsed view. */
class FakeVault implements VaultAdapter {
  bodies = new Map<string, string>();
  fm = new Map<string, Record<string, unknown>>();
  failOn = new Set<string>();
  async read(p: string) { return this.bodies.get(p) ?? ''; }
  async write(p: string, c: string) { this.bodies.set(p, c); }
  async create(p: string, c: string) {
    if (this.failOn.has(p)) throw new Error('disk full');
    if (this.bodies.has(p)) throw new Error('exists');
    this.bodies.set(p, c);
  }
  async rename() { throw new Error('unused'); }
  async exists(p: string) { return this.bodies.has(p); }
  async list() { return []; }
  async processFrontmatter(p: string, mutate: (fm: Record<string, unknown>) => void) {
    const fm = { ...(this.fm.get(p) ?? {}) };
    mutate(fm);
    this.fm.set(p, fm);
  }
}

const withProjects = (projects: TaskTrackerSettings['projects']): TaskTrackerSettings => ({
  ...DEFAULT_SETTINGS,
  projects,
  schema: [
    ...DEFAULT_SETTINGS.schema,
    { key: 'project', label: 'Project', type: 'select', options: ['Alpha'], order: 99 },
  ],
});

describe('migrateLegacyProjects', () => {
  it('writes a settings file beside each project folder', async () => {
    const vault = new FakeVault();
    const settings = withProjects([{ name: 'Alpha', idPrefix: 'ALP' }]);
    const result = await migrateLegacyProjects(vault, settings);
    expect(result).toEqual({ created: ['Alpha/Settings/project.md'], skipped: [], failed: [] });
    expect(vault.bodies.get('Alpha/Settings/project.md')).toBe(PROJECT_FILE_BODY);
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', vault.fm.get('Alpha/Settings/project.md') ?? null);
    expect(warnings).toEqual([]);
    expect(project?.idPrefix).toBe('ALP');
    expect(project?.tasksFolder).toBe('Alpha/Tasks');
    expect(project?.schema.map((f) => f.key)).not.toContain('project');
    expect(project?.schema).toHaveLength(DEFAULT_SETTINGS.schema.length);
  });

  it('never overwrites an existing settings file', async () => {
    const vault = new FakeVault();
    vault.bodies.set('Alpha/Settings/project.md', 'mine');
    const result = await migrateLegacyProjects(vault, withProjects([{ name: 'Alpha', idPrefix: 'ALP' }]));
    expect(result.skipped).toEqual(['Alpha/Settings/project.md']);
    expect(vault.bodies.get('Alpha/Settings/project.md')).toBe('mine');
  });

  it('gives a project with no parent folder its own root, pointing back at its tasks', async () => {
    const vault = new FakeVault();
    const result = await migrateLegacyProjects(vault, withProjects([{ name: 'Web', idPrefix: 'WEB', folder: 'Web Tasks' }]));
    expect(result.created).toEqual(['Web/Settings/project.md']);
    expect(vault.fm.get('Web/Settings/project.md')?.tasksFolder).toBe('/Web Tasks');
  });

  it('does not let two projects under one parent share a settings file', async () => {
    const vault = new FakeVault();
    const result = await migrateLegacyProjects(vault, withProjects([
      { name: 'A', idPrefix: 'A', folder: 'Work/A' },
      { name: 'B', idPrefix: 'B', folder: 'Work/B' },
    ]));
    expect(result.created).toEqual(['Work/Settings/project.md', 'B/Settings/project.md']);
    const b = parseProjectFile('B/Settings/project.md', vault.fm.get('B/Settings/project.md') ?? null);
    expect(b.project?.tasksFolder).toBe('Work/B');
  });

  it('reports failures without stopping the rest', async () => {
    const vault = new FakeVault();
    vault.failOn.add('Alpha/Settings/project.md');
    const result = await migrateLegacyProjects(vault, withProjects([
      { name: 'Alpha', idPrefix: 'ALP' },
      { name: 'Beta', idPrefix: 'BET' },
    ]));
    expect(result.failed).toEqual(['Alpha: disk full']);
    expect(result.created).toEqual(['Beta/Settings/project.md']);
  });
});

describe('withoutLegacyProjects', () => {
  it('drops the project list and the global project field', () => {
    const next = withoutLegacyProjects(withProjects([{ name: 'Alpha', idPrefix: 'ALP' }]));
    expect(next.projects).toBeUndefined();
    expect(next.schema.some((f) => f.key === 'project')).toBe(false);
  });
});
