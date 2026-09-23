import { describe, expect, it } from 'vitest';
import {
  isProjectFilePath, noProjectScope, parentOf, parseProjectFile, projectFilePath, projectRoot,
  relativeTasksFolder, resolveTasksFolder, serializeProjectFrontmatter,
} from '../../src/settings/projectFile';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';

const STATUS = { key: 'status', label: 'Status', type: 'select', options: ['To Do', 'Done'] };

describe('paths', () => {
  it('recognises Settings/project.md at any depth', () => {
    expect(isProjectFilePath('Alpha/Settings/project.md')).toBe(true);
    expect(isProjectFilePath('Work/Alpha/Settings/project.md')).toBe(true);
    expect(isProjectFilePath('Settings/project.md')).toBe(true);
    expect(isProjectFilePath('Alpha/Settings/other.md')).toBe(false);
    expect(isProjectFilePath('Alpha/MySettings/project.md')).toBe(false);
  });

  it('derives the root and back', () => {
    expect(projectRoot('Work/Alpha/Settings/project.md')).toBe('Work/Alpha');
    expect(projectRoot('Settings/project.md')).toBe('');
    expect(projectFilePath('Work/Alpha')).toBe('Work/Alpha/Settings/project.md');
    expect(projectFilePath('')).toBe('Settings/project.md');
  });

  it('parentOf returns the containing folder', () => {
    expect(parentOf('A/B/c.md')).toBe('A/B');
    expect(parentOf('c.md')).toBe('');
  });

  it('resolves tasksFolder relative to the root, or as a vault path with a leading slash', () => {
    expect(resolveTasksFolder('Alpha', 'Tasks')).toBe('Alpha/Tasks');
    expect(resolveTasksFolder('Alpha', ' /Shared/Tasks/ ')).toBe('Shared/Tasks');
    expect(resolveTasksFolder('Alpha', '')).toBe('Alpha/Tasks');
    expect(resolveTasksFolder('', 'Tasks')).toBe('Tasks');
    expect(relativeTasksFolder('Alpha', 'Alpha/Tasks')).toBe('Tasks');
    expect(relativeTasksFolder('Alpha', 'Shared/Tasks')).toBe('/Shared/Tasks');
  });
});

describe('parseProjectFile', () => {
  it('ignores a file without the marker, silently', () => {
    expect(parseProjectFile('A/Settings/project.md', { title: 'x' })).toEqual({ project: null, warnings: [] });
    expect(parseProjectFile('A/Settings/project.md', null)).toEqual({ project: null, warnings: [] });
  });

  it('rejects a marked file without a name or prefix, with a warning', () => {
    const noName = parseProjectFile('A/Settings/project.md', { 'tt-project': '', idPrefix: 'A' });
    expect(noName.project).toBeNull();
    expect(noName.warnings).toHaveLength(1);
    const noPrefix = parseProjectFile('A/Settings/project.md', { 'tt-project': 'Alpha' });
    expect(noPrefix.project).toBeNull();
    expect(noPrefix.warnings[0]).toContain('idPrefix');
  });

  it('parses a full file', () => {
    const { project, warnings } = parseProjectFile('Work/Alpha/Settings/project.md', {
      'tt-project': 'Alpha',
      idPrefix: 'ALP',
      tasksFolder: 'Issues',
      statusField: 'status',
      doneStatuses: ['Done'],
      dueField: 'due',
      fields: [STATUS, { key: 'due', label: 'Due', type: 'date', showInList: true }],
    });
    expect(warnings).toEqual([]);
    expect(project).toEqual({
      name: 'Alpha',
      filePath: 'Work/Alpha/Settings/project.md',
      idPrefix: 'ALP',
      tasksFolder: 'Work/Alpha/Issues',
      schema: [
        { key: 'status', label: 'Status', type: 'select', options: ['To Do', 'Done'], order: 0 },
        { key: 'due', label: 'Due', type: 'date', showInList: true, order: 1 },
      ],
      statusFieldKey: 'status',
      doneStatuses: ['Done'],
      dueFieldKey: 'due',
    });
  });

  it('applies defaults for optional keys', () => {
    const { project } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP', fields: [STATUS],
    });
    expect(project?.tasksFolder).toBe('Alpha/Tasks');
    expect(project?.statusFieldKey).toBe('status');
    expect(project?.doneStatuses).toEqual(['Done']);
    expect(project?.dueFieldKey).toBeNull();
  });

  it('skips broken fields but keeps the valid ones', () => {
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha',
      idPrefix: 'ALP',
      fields: [
        STATUS,
        { label: 'No key', type: 'text' },
        { key: 'x', type: 'colour' },
        'nonsense',
        { key: 'status', label: 'Again', type: 'text' },
        { key: 'sprint', label: 'Sprint', type: 'multiselect', options: 'S1' },
      ],
    });
    expect(project?.schema.map((f) => f.key)).toEqual(['status', 'sprint']);
    expect(project?.schema[1].options).toBeUndefined();
    expect(warnings).toHaveLength(4);
  });

  it('warns when fields are missing', () => {
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP',
    });
    expect(project?.schema).toEqual([]);
    expect(warnings[0]).toContain('fields');
  });

  it('warns about status/due fields that do not exist and falls back', () => {
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP', statusField: 'state', dueField: 'deadline',
      fields: [STATUS],
    });
    expect(project?.statusFieldKey).toBe('status');
    expect(project?.dueFieldKey).toBeNull();
    expect(warnings).toHaveLength(2);
  });

  it('treats an explicit null dueField as "no due badge"', () => {
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP', dueField: null,
      fields: [STATUS, { key: 'due', label: 'Due', type: 'date' }],
    });
    expect(project?.dueFieldKey).toBeNull();
    expect(warnings).toEqual([]);
  });
});

describe('serializeProjectFrontmatter', () => {
  it('round-trips through parseProjectFile', () => {
    const { project } = parseProjectFile('Work/Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP', tasksFolder: '/Shared/Alpha', dueField: 'due',
      doneStatuses: ['Done', 'Won\'t do'],
      fields: [STATUS, { key: 'due', label: 'Due', type: 'date', required: true }],
    });
    if (!project) throw new Error('expected a project');
    const fm = serializeProjectFrontmatter(project);
    expect(fm.tasksFolder).toBe('/Shared/Alpha');
    expect(parseProjectFile(project.filePath as string, fm)).toEqual({ project, warnings: [] });
  });
});

describe('noProjectScope', () => {
  it('is built from plugin settings', () => {
    const s = noProjectScope(DEFAULT_SETTINGS);
    expect(s.name).toBeNull();
    expect(s.filePath).toBeNull();
    expect(s.tasksFolder).toBe('Tasks');
    expect(s.schema).toBe(DEFAULT_SETTINGS.schema);
  });
});

describe('skipped field entries', () => {
  const fm = {
    'tt-project': 'Alpha', idPrefix: 'ALP',
    fields: [STATUS, { key: 'sprint', label: 'Sprint', type: 'selct', options: ['S1'] }, { key: 'due', label: 'Due', type: 'date' }],
  };

  it('are remembered with their position', () => {
    const { project } = parseProjectFile('Alpha/Settings/project.md', fm);
    expect(project?.skippedFields).toEqual([{ index: 1, raw: fm.fields[1] }]);
  });

  it('are written back in place on save', () => {
    const { project } = parseProjectFile('Alpha/Settings/project.md', fm);
    if (!project) throw new Error('expected a project');
    const out = serializeProjectFrontmatter(project).fields as Record<string, unknown>[];
    expect(out.map((f) => f.key)).toEqual(['status', 'sprint', 'due']);
    expect(out[1]).toEqual(fm.fields[1]);
  });
});
