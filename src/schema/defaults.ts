import type { FieldDef } from './types';

export const RESERVED_KEYS = ['id', 'title', 'created', 'updated'] as const;

export const DEFAULT_SCHEMA: FieldDef[] = [
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'],
    required: true,
    showInList: true,
    order: 0,
  },
  { key: 'assignee', label: 'Assignee', type: 'person', showInList: true, order: 1 },
  {
    key: 'priority',
    label: 'Priority',
    type: 'select',
    options: ['Low', 'Medium', 'High', 'Urgent'],
    showInList: true,
    order: 2,
  },
  {
    key: 'type',
    label: 'Type',
    type: 'select',
    options: ['Task', 'Bug', 'Story', 'Chore'],
    showInList: true,
    order: 3,
  },
  { key: 'labels', label: 'Labels', type: 'multiselect', options: [], order: 4 },
  { key: 'start', label: 'Start date', type: 'date', order: 5 },
  { key: 'due', label: 'Due date', type: 'date', showInList: true, order: 6 },
  { key: 'estimate', label: 'Estimate', type: 'text', order: 7 },
];
