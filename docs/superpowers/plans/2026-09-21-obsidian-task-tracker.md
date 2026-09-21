# Obsidian Task Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian plugin presenting a Jira-style two-pane task tracker over a flat folder of markdown task files, with a GUI-editable field schema.

**Architecture:** Strictly layered, dependency direction downward. Pure modules (`schema`, `model`, `query`) never import from `obsidian` and carry the real test coverage. `index` builds an in-memory task map from Obsidian's `metadataCache`; `write` is the only module that touches the vault; `ui` is Preact mounted into an `ItemView` and reads through a small store.

**Tech Stack:** TypeScript (strict), esbuild, Preact 10, Vitest, Obsidian plugin API.

**Spec:** `docs/superpowers/specs/2026-09-21-obsidian-task-tracker-design.md`

## Global Constraints

- Plugin ID: `obsidian-task-tracker`. Minimum Obsidian version: `1.4.0`.
- `obsidian` is an esbuild **external**; Preact is **bundled**.
- Modules under `src/schema/`, `src/model/`, `src/query/` MUST NOT import from `obsidian`. This is what makes them testable; a violation breaks the test suite setup.
- TypeScript `strict: true`. No `any` in exported signatures.
- Hard-coded task fields, never in the user schema: `id`, `title`, `created`, `updated`.
- Dates: `date` field values serialize as `YYYY-MM-DD`. Timestamps (`created`, `updated`, comment times) serialize as ISO 8601 seconds precision, no timezone suffix: `YYYY-MM-DDTHH:mm:ss`.
- Every task ends with a commit. Use conventional commit prefixes (`feat:`, `test:`, `chore:`). Follow whatever commit-attribution rule your harness gives you.

---

### Task 1: Repo scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, `versions.json`, `styles.css`, `vitest.config.ts`, `.env.example`
- Create: `src/main.ts`
- Create: `tests/scaffold.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` and `npm run build`. Later tasks assume `vitest` runs files matching `tests/**/*.test.ts` and that `src/` is importable via relative paths.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "obsidian-task-tracker",
  "version": "0.1.0",
  "description": "Jira-style task tracker for Obsidian",
  "main": "main.js",
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.mjs production",
    "dev": "node esbuild.config.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "preact": "^10.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.21.0",
    "obsidian": "latest",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["DOM", "ES2020"],
    "strict": true,
    "noImplicitAny": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `manifest.json` and `versions.json`**

`manifest.json`:
```json
{
  "id": "obsidian-task-tracker",
  "name": "Task Tracker",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "A Jira-style task tracker over a flat folder of markdown files.",
  "author": "ahassan",
  "isDesktopOnly": false
}
```

`versions.json`:
```json
{ "0.1.0": "1.4.0" }
```

- [ ] **Step 5: Create `esbuild.config.mjs`**

```js
import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';
import fs from 'fs';
import path from 'path';

const prod = process.argv[2] === 'production';

const copyToVault = {
  name: 'copy-to-vault',
  setup(build) {
    build.onEnd(() => {
      const vault = process.env.VAULT_PATH;
      if (!vault) return;
      const dest = path.join(vault, '.obsidian', 'plugins', 'obsidian-task-tracker');
      fs.mkdirSync(dest, { recursive: true });
      for (const f of ['main.js', 'manifest.json', 'styles.css']) {
        if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dest, f));
      }
      console.log(`copied plugin to ${dest}`);
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...builtins],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  plugins: [copyToVault],
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
```

- [ ] **Step 6: Create `.env.example` and update `.gitignore`**

`.env.example`:
```
# Absolute path to the Obsidian vault to copy dev builds into.
VAULT_PATH=/Users/you/Documents/MyVault
```

Append to `.gitignore` (create the file if missing):
```
node_modules/
main.js
main.js.map
.env
*.log
```

- [ ] **Step 7: Create `styles.css` placeholder**

```css
/* Task Tracker styles. Populated in Task 9. */
```

- [ ] **Step 8: Create minimal `src/main.ts`**

```ts
import { Plugin } from 'obsidian';

export default class TaskTrackerPlugin extends Plugin {
  async onload(): Promise<void> {
    console.log('Task Tracker loaded');
  }
}
```

- [ ] **Step 9: Write the scaffold test**

`tests/scaffold.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';

describe('scaffold', () => {
  it('declares the expected plugin id and version floor', () => {
    expect(manifest.id).toBe('obsidian-task-tracker');
    expect(manifest.minAppVersion).toBe('1.4.0');
  });
});
```

- [ ] **Step 10: Install and run**

Run: `npm install && npm test`
Expected: 1 test passes.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold obsidian plugin with esbuild and vitest"
```

---

### Task 2: Field schema types, defaults, and value coercion

**Files:**
- Create: `src/schema/types.ts`
- Create: `src/schema/defaults.ts`
- Create: `src/schema/coerce.ts`
- Test: `tests/schema/coerce.test.ts`, `tests/schema/defaults.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type FieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'person'`
  - `interface FieldDef { key: string; label: string; type: FieldType; options?: string[]; required?: boolean; showInList?: boolean; order: number }`
  - `type FieldValue = string | number | boolean | string[] | null`
  - `const DEFAULT_SCHEMA: FieldDef[]`
  - `const RESERVED_KEYS: readonly string[]` — `['id','title','created','updated']`
  - `function coerceValue(def: FieldDef, raw: unknown): { ok: true; value: FieldValue } | { ok: false; raw: unknown }`
  - `function isEmpty(value: FieldValue): boolean`

- [ ] **Step 1: Write the failing tests**

`tests/schema/coerce.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { coerceValue, isEmpty } from '../../src/schema/coerce';
import type { FieldDef } from '../../src/schema/types';

const def = (over: Partial<FieldDef>): FieldDef => ({
  key: 'f', label: 'F', type: 'text', order: 0, ...over,
});

describe('coerceValue', () => {
  it('passes through text', () => {
    expect(coerceValue(def({ type: 'text' }), 'hello')).toEqual({ ok: true, value: 'hello' });
  });

  it('stringifies non-string text values', () => {
    expect(coerceValue(def({ type: 'text' }), 42)).toEqual({ ok: true, value: '42' });
  });

  it('parses numeric strings for number fields', () => {
    expect(coerceValue(def({ type: 'number' }), '3.5')).toEqual({ ok: true, value: 3.5 });
  });

  it('rejects non-numeric text for number fields', () => {
    expect(coerceValue(def({ type: 'number' }), 'abc')).toEqual({ ok: false, raw: 'abc' });
  });

  it('accepts YYYY-MM-DD dates', () => {
    expect(coerceValue(def({ type: 'date' }), '2026-09-21')).toEqual({ ok: true, value: '2026-09-21' });
  });

  it('rejects malformed dates', () => {
    expect(coerceValue(def({ type: 'date' }), '21/09/2026')).toEqual({ ok: false, raw: '21/09/2026' });
  });

  it('rejects calendar-invalid dates', () => {
    expect(coerceValue(def({ type: 'date' }), '2026-02-30')).toEqual({ ok: false, raw: '2026-02-30' });
  });

  it('accepts a select value that is in options', () => {
    const d = def({ type: 'select', options: ['To Do', 'Done'] });
    expect(coerceValue(d, 'Done')).toEqual({ ok: true, value: 'Done' });
  });

  it('rejects a select value outside options', () => {
    const d = def({ type: 'select', options: ['To Do', 'Done'] });
    expect(coerceValue(d, 'Nope')).toEqual({ ok: false, raw: 'Nope' });
  });

  it('wraps a bare string into a multiselect array', () => {
    const d = def({ type: 'multiselect', options: ['a', 'b'] });
    expect(coerceValue(d, 'a')).toEqual({ ok: true, value: ['a'] });
  });

  it('rejects a multiselect array containing an unknown option', () => {
    const d = def({ type: 'multiselect', options: ['a', 'b'] });
    expect(coerceValue(d, ['a', 'z'])).toEqual({ ok: false, raw: ['a', 'z'] });
  });

  it('coerces truthy strings to checkbox booleans', () => {
    expect(coerceValue(def({ type: 'checkbox' }), 'true')).toEqual({ ok: true, value: true });
    expect(coerceValue(def({ type: 'checkbox' }), false)).toEqual({ ok: true, value: false });
  });

  it('rejects unrecognised checkbox values', () => {
    expect(coerceValue(def({ type: 'checkbox' }), 'maybe')).toEqual({ ok: false, raw: 'maybe' });
  });

  it('treats person as free text', () => {
    expect(coerceValue(def({ type: 'person' }), 'Ahmed')).toEqual({ ok: true, value: 'Ahmed' });
  });

  it('maps null and undefined to a null value for every type', () => {
    expect(coerceValue(def({ type: 'number' }), null)).toEqual({ ok: true, value: null });
    expect(coerceValue(def({ type: 'select', options: ['a'] }), undefined)).toEqual({ ok: true, value: null });
  });

  it('maps empty string to null', () => {
    expect(coerceValue(def({ type: 'text' }), '')).toEqual({ ok: true, value: null });
  });
});

describe('isEmpty', () => {
  it('treats null and empty collections as empty', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty('')).toBe(true);
  });

  it('treats false and zero as present', () => {
    expect(isEmpty(false)).toBe(false);
    expect(isEmpty(0)).toBe(false);
  });
});
```

`tests/schema/defaults.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEMA, RESERVED_KEYS } from '../../src/schema/defaults';

describe('DEFAULT_SCHEMA', () => {
  it('contains no reserved keys', () => {
    for (const f of DEFAULT_SCHEMA) {
      expect(RESERVED_KEYS).not.toContain(f.key);
    }
  });

  it('has unique keys', () => {
    const keys = DEFAULT_SCHEMA.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has contiguous order values starting at 0', () => {
    const orders = DEFAULT_SCHEMA.map((f) => f.order).sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, i) => i));
  });

  it('ships status as a select with options', () => {
    const status = DEFAULT_SCHEMA.find((f) => f.key === 'status');
    expect(status?.type).toBe('select');
    expect(status?.options).toContain('In Progress');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/schema`
Expected: FAIL — cannot resolve `../../src/schema/coerce`.

- [ ] **Step 3: Create `src/schema/types.ts`**

```ts
export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'person';

export interface FieldDef {
  /** Frontmatter key. Immutable after creation. */
  key: string;
  /** Display name. Freely editable. */
  label: string;
  type: FieldType;
  /** select / multiselect only. */
  options?: string[];
  required?: boolean;
  /** Render as a badge on list rows. */
  showInList?: boolean;
  order: number;
}

export type FieldValue = string | number | boolean | string[] | null;

export type CoerceResult =
  | { ok: true; value: FieldValue }
  | { ok: false; raw: unknown };
```

- [ ] **Step 4: Create `src/schema/defaults.ts`**

```ts
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
```

- [ ] **Step 5: Create `src/schema/coerce.ts`**

```ts
import type { CoerceResult, FieldDef, FieldValue } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export function coerceValue(def: FieldDef, raw: unknown): CoerceResult {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };

  switch (def.type) {
    case 'text':
    case 'person':
      return { ok: true, value: String(raw) };

    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, raw };
    }

    case 'date': {
      const s = String(raw);
      return DATE_RE.test(s) && isRealDate(s)
        ? { ok: true, value: s }
        : { ok: false, raw };
    }

    case 'select': {
      const s = String(raw);
      return (def.options ?? []).includes(s) ? { ok: true, value: s } : { ok: false, raw };
    }

    case 'multiselect': {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const options = def.options ?? [];
      // An empty options list means the field accepts any tag.
      if (options.length > 0 && !arr.every((v) => options.includes(v))) {
        return { ok: false, raw };
      }
      return { ok: true, value: arr };
    }

    case 'checkbox': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      const s = String(raw).toLowerCase();
      if (s === 'true' || s === 'yes') return { ok: true, value: true };
      if (s === 'false' || s === 'no') return { ok: true, value: false };
      return { ok: false, raw };
    }
  }
}

export function isEmpty(value: FieldValue): boolean {
  if (value === null) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
```

Note the deliberate rule in `multiselect`: an empty `options` array means "any value allowed", which is what makes the default `labels` field usable as free-form tags. The test that rejects `['a','z']` supplies non-empty options, so both behaviours are covered.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/schema`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/schema tests/schema
git commit -m "feat: add field schema types, defaults, and value coercion"
```

---

### Task 3: Schema validation and mutation

**Files:**
- Create: `src/schema/validate.ts`
- Test: `tests/schema/validate.test.ts`

**Interfaces:**
- Consumes: `FieldDef`, `FieldType`, `RESERVED_KEYS` from Task 2.
- Produces:
  - `function validateFieldDef(def: FieldDef, existing: FieldDef[]): string[]` — returns human-readable error messages; empty means valid.
  - `function addField(schema: FieldDef[], def: FieldDef): FieldDef[]`
  - `function updateField(schema: FieldDef[], key: string, patch: Partial<Omit<FieldDef, 'key'>>): FieldDef[]`
  - `function removeField(schema: FieldDef[], key: string): FieldDef[]`
  - `function reorderField(schema: FieldDef[], key: string, newOrder: number): FieldDef[]`
  - `function sortedSchema(schema: FieldDef[]): FieldDef[]`

- [ ] **Step 1: Write the failing tests**

`tests/schema/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  addField, removeField, reorderField, sortedSchema, updateField, validateFieldDef,
} from '../../src/schema/validate';
import type { FieldDef } from '../../src/schema/types';

const base: FieldDef[] = [
  { key: 'status', label: 'Status', type: 'select', options: ['To Do'], order: 0 },
  { key: 'assignee', label: 'Assignee', type: 'person', order: 1 },
];

describe('validateFieldDef', () => {
  it('accepts a well-formed new field', () => {
    expect(validateFieldDef(
      { key: 'severity', label: 'Severity', type: 'select', options: ['S1'], order: 2 }, base,
    )).toEqual([]);
  });

  it('rejects a reserved key', () => {
    const errs = validateFieldDef({ key: 'title', label: 'T', type: 'text', order: 2 }, base);
    expect(errs.join(' ')).toMatch(/reserved/i);
  });

  it('rejects a duplicate key', () => {
    const errs = validateFieldDef({ key: 'status', label: 'S', type: 'text', order: 2 }, base);
    expect(errs.join(' ')).toMatch(/already/i);
  });

  it('rejects a key that is not a valid frontmatter identifier', () => {
    const errs = validateFieldDef({ key: 'two words', label: 'X', type: 'text', order: 2 }, base);
    expect(errs.join(' ')).toMatch(/letters/i);
  });

  it('rejects an empty label', () => {
    const errs = validateFieldDef({ key: 'ok', label: '  ', type: 'text', order: 2 }, base);
    expect(errs.join(' ')).toMatch(/label/i);
  });

  it('requires options on a select field', () => {
    const errs = validateFieldDef({ key: 'sev', label: 'Sev', type: 'select', options: [], order: 2 }, base);
    expect(errs.join(' ')).toMatch(/option/i);
  });

  it('does not require options on a multiselect field', () => {
    expect(validateFieldDef(
      { key: 'tags', label: 'Tags', type: 'multiselect', options: [], order: 2 }, base,
    )).toEqual([]);
  });

  it('rejects duplicate options', () => {
    const errs = validateFieldDef(
      { key: 'sev', label: 'Sev', type: 'select', options: ['a', 'a'], order: 2 }, base,
    );
    expect(errs.join(' ')).toMatch(/duplicate/i);
  });
});

describe('schema mutation', () => {
  it('appends a field with the next order', () => {
    const next = addField(base, { key: 'sev', label: 'Sev', type: 'text', order: 99 });
    expect(next.find((f) => f.key === 'sev')?.order).toBe(2);
    expect(next).toHaveLength(3);
  });

  it('does not mutate the input schema', () => {
    addField(base, { key: 'sev', label: 'Sev', type: 'text', order: 99 });
    expect(base).toHaveLength(2);
  });

  it('updates a field without changing its key', () => {
    const next = updateField(base, 'status', { label: 'State' });
    expect(next.find((f) => f.key === 'status')?.label).toBe('State');
  });

  it('removes a field and closes the order gap', () => {
    const next = removeField(base, 'status');
    expect(next).toHaveLength(1);
    expect(next[0].order).toBe(0);
  });

  it('reorders a field and renumbers the rest contiguously', () => {
    const three = addField(base, { key: 'sev', label: 'Sev', type: 'text', order: 99 });
    const next = sortedSchema(reorderField(three, 'sev', 0));
    expect(next.map((f) => f.key)).toEqual(['sev', 'status', 'assignee']);
    expect(next.map((f) => f.order)).toEqual([0, 1, 2]);
  });

  it('returns the schema unchanged when reordering an unknown key', () => {
    expect(reorderField(base, 'nope', 0)).toEqual(base);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/schema/validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/schema/validate.ts`**

```ts
import { RESERVED_KEYS } from './defaults';
import type { FieldDef } from './types';

const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function validateFieldDef(def: FieldDef, existing: FieldDef[]): string[] {
  const errors: string[] = [];

  if (!KEY_RE.test(def.key)) {
    errors.push('Key must start with a letter and contain only letters, numbers, hyphens or underscores.');
  }
  if ((RESERVED_KEYS as readonly string[]).includes(def.key)) {
    errors.push(`"${def.key}" is a reserved key.`);
  }
  if (existing.some((f) => f.key === def.key)) {
    errors.push(`A field with the key "${def.key}" already exists.`);
  }
  if (def.label.trim().length === 0) {
    errors.push('Label cannot be empty.');
  }
  if (def.type === 'select' && (def.options ?? []).length === 0) {
    errors.push('A select field needs at least one option.');
  }
  const options = def.options ?? [];
  if (new Set(options).size !== options.length) {
    errors.push('Options contain duplicates.');
  }

  return errors;
}

function renumber(schema: FieldDef[]): FieldDef[] {
  return [...schema]
    .sort((a, b) => a.order - b.order)
    .map((f, i) => ({ ...f, order: i }));
}

export function sortedSchema(schema: FieldDef[]): FieldDef[] {
  return [...schema].sort((a, b) => a.order - b.order);
}

export function addField(schema: FieldDef[], def: FieldDef): FieldDef[] {
  return renumber([...schema, { ...def, order: schema.length }]);
}

export function updateField(
  schema: FieldDef[],
  key: string,
  patch: Partial<Omit<FieldDef, 'key'>>,
): FieldDef[] {
  return schema.map((f) => (f.key === key ? { ...f, ...patch, key: f.key } : f));
}

export function removeField(schema: FieldDef[], key: string): FieldDef[] {
  return renumber(schema.filter((f) => f.key !== key));
}

export function reorderField(schema: FieldDef[], key: string, newOrder: number): FieldDef[] {
  const sorted = sortedSchema(schema);
  const from = sorted.findIndex((f) => f.key === key);
  if (from === -1) return schema;
  const [moved] = sorted.splice(from, 1);
  const to = Math.max(0, Math.min(newOrder, sorted.length));
  sorted.splice(to, 0, moved);
  return sorted.map((f, i) => ({ ...f, order: i }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/schema`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schema/validate.ts tests/schema/validate.test.ts
git commit -m "feat: add schema validation and mutation helpers"
```

---

### Task 4: Task model — parsing

**Files:**
- Create: `src/model/types.ts`
- Create: `src/model/parse.ts`
- Test: `tests/model/parse.test.ts`

**Interfaces:**
- Consumes: `FieldValue` from Task 2.
- Produces:
  - `interface Comment { id: string; author: string; timestamp: string; body: string }`
  - `interface Task { path: string; id: string | null; title: string; fields: Record<string, unknown>; description: string; comments: Comment[]; created: string | null; updated: string | null; parseErrors: string[] }`
  - `interface Sections { frontmatterEnd: number; descriptionStart: number; descriptionEnd: number; commentsStart: number; commentsEnd: number }`
  - `function splitFrontmatter(content: string): { frontmatter: string; bodyStart: number }`
  - `function locateSections(content: string): Sections`
  - `function parseComments(commentsBody: string): Comment[]`
  - `function parseTask(path: string, frontmatter: Record<string, unknown>, content: string): Task`

  A `Comment.id` is `` `${timestamp}#${index}` `` — stable enough to key a list and to address a comment for edit/delete within one file version.

- [ ] **Step 1: Write the failing tests**

`tests/model/parse.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { locateSections, parseComments, parseTask, splitFrontmatter } from '../../src/model/parse';

const FILE = `---
id: TASK-42
title: Fix login redirect
status: In Progress
---

## Description

The redirect loops when the session cookie is stale.

Second paragraph.

## Comments

### Ahmed — 2026-09-21T09:10:00
First comment.

### Ahmed — 2026-09-22T11:02:00
Second comment, which
spans two lines.
`;

const FM = { id: 'TASK-42', title: 'Fix login redirect', status: 'In Progress' };

describe('splitFrontmatter', () => {
  it('extracts the frontmatter block and the body offset', () => {
    const r = splitFrontmatter(FILE);
    expect(r.frontmatter).toContain('id: TASK-42');
    expect(FILE.slice(r.bodyStart).startsWith('\n\n## Description')).toBe(true);
  });

  it('handles a file with no frontmatter', () => {
    const r = splitFrontmatter('## Description\n\nhi\n');
    expect(r.frontmatter).toBe('');
    expect(r.bodyStart).toBe(0);
  });
});

describe('locateSections', () => {
  it('finds description and comments ranges', () => {
    const s = locateSections(FILE);
    expect(FILE.slice(s.descriptionStart, s.descriptionEnd).trim())
      .toBe('The redirect loops when the session cookie is stale.\n\nSecond paragraph.');
    expect(FILE.slice(s.commentsStart, s.commentsEnd)).toContain('First comment.');
  });

  it('reports -1 ranges when a section is absent', () => {
    const s = locateSections('---\nid: T-1\n---\n\nJust text.\n');
    expect(s.descriptionStart).toBe(-1);
    expect(s.commentsStart).toBe(-1);
  });

  it('is not confused by a ## heading inside the description', () => {
    const f = '---\nid: T-1\n---\n\n## Description\n\nbody\n\n## Notes\n\nother\n\n## Comments\n\n';
    const s = locateSections(f);
    expect(f.slice(s.descriptionStart, s.descriptionEnd).trim()).toBe('body');
  });
});

describe('parseComments', () => {
  it('parses author, timestamp and multi-line body', () => {
    const s = locateSections(FILE);
    const cs = parseComments(FILE.slice(s.commentsStart, s.commentsEnd));
    expect(cs).toHaveLength(2);
    expect(cs[0].author).toBe('Ahmed');
    expect(cs[0].timestamp).toBe('2026-09-21T09:10:00');
    expect(cs[0].body).toBe('First comment.');
    expect(cs[1].body).toBe('Second comment, which\nspans two lines.');
  });

  it('returns an empty list for an empty section', () => {
    expect(parseComments('')).toEqual([]);
    expect(parseComments('\n\n')).toEqual([]);
  });

  it('gives each comment a distinct id', () => {
    const s = locateSections(FILE);
    const cs = parseComments(FILE.slice(s.commentsStart, s.commentsEnd));
    expect(new Set(cs.map((c) => c.id)).size).toBe(2);
  });
});

describe('parseTask', () => {
  it('builds a task from frontmatter and content', () => {
    const t = parseTask('Tasks/TASK-42 Fix login redirect.md', FM, FILE);
    expect(t.id).toBe('TASK-42');
    expect(t.title).toBe('Fix login redirect');
    expect(t.fields.status).toBe('In Progress');
    expect(t.description).toContain('redirect loops');
    expect(t.comments).toHaveLength(2);
    expect(t.parseErrors).toEqual([]);
  });

  it('falls back to the filename for a missing title', () => {
    const t = parseTask('Tasks/TASK-7 Orphan.md', { id: 'TASK-7' }, '---\nid: TASK-7\n---\n');
    expect(t.title).toBe('TASK-7 Orphan');
  });

  it('records a parse error for a missing id', () => {
    const t = parseTask('Tasks/Loose note.md', {}, '# hi\n');
    expect(t.id).toBeNull();
    expect(t.parseErrors.join(' ')).toMatch(/id/i);
  });

  it('excludes reserved keys from fields', () => {
    const t = parseTask('Tasks/TASK-42 x.md', FM, FILE);
    expect(t.fields).not.toHaveProperty('id');
    expect(t.fields).not.toHaveProperty('title');
  });

  it('yields an empty description when the section is absent', () => {
    const t = parseTask('Tasks/TASK-9 x.md', { id: 'TASK-9', title: 'x' }, '---\nid: TASK-9\n---\n\nloose text\n');
    expect(t.description).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/model`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/model/types.ts`**

```ts
export interface Comment {
  /** Stable within one parse of one file: `${timestamp}#${index}`. */
  id: string;
  author: string;
  /** ISO 8601, seconds precision, no timezone: YYYY-MM-DDTHH:mm:ss */
  timestamp: string;
  body: string;
}

export interface Task {
  /** Vault-relative path, the identity used by the index. */
  path: string;
  id: string | null;
  title: string;
  /** Frontmatter values excluding reserved keys. Raw; coercion happens at the edge. */
  fields: Record<string, unknown>;
  description: string;
  comments: Comment[];
  created: string | null;
  updated: string | null;
  /** Non-empty means render a warning rather than widgets. */
  parseErrors: string[];
}

export interface Sections {
  /** Offset just past the closing `---`, or 0 when there is no frontmatter. */
  frontmatterEnd: number;
  /** -1 when the section is absent. */
  descriptionStart: number;
  descriptionEnd: number;
  commentsStart: number;
  commentsEnd: number;
}
```

- [ ] **Step 4: Create `src/model/parse.ts`**

```ts
import type { Comment, Sections, Task } from './types';

const RESERVED = new Set(['id', 'title', 'created', 'updated']);
const COMMENT_RE = /^###\s+(.+?)\s+—\s+(\S+)\s*$/;

export function splitFrontmatter(content: string): { frontmatter: string; bodyStart: number } {
  if (!content.startsWith('---')) return { frontmatter: '', bodyStart: 0 };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: '', bodyStart: 0 };
  const closeLineEnd = content.indexOf('\n', end + 1);
  const bodyStart = closeLineEnd === -1 ? content.length : closeLineEnd;
  return { frontmatter: content.slice(content.indexOf('\n') + 1, end), bodyStart };
}

/** Offsets of every top-level `## ` heading, in document order. */
function headingOffsets(content: string, from: number): { start: number; end: number; title: string }[] {
  const out: { start: number; end: number; title: string }[] = [];
  const re = /^##\s+(.+?)\s*$/gm;
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, title: m[1] });
  }
  return out;
}

export function locateSections(content: string): Sections {
  const { bodyStart } = splitFrontmatter(content);
  const heads = headingOffsets(content, bodyStart);

  const rangeFor = (title: string): [number, number] => {
    const i = heads.findIndex((h) => h.title.toLowerCase() === title);
    if (i === -1) return [-1, -1];
    const start = heads[i].end;
    const end = i + 1 < heads.length ? heads[i + 1].start : content.length;
    return [start, end];
  };

  const [descriptionStart, descriptionEnd] = rangeFor('description');
  const [commentsStart, commentsEnd] = rangeFor('comments');

  return {
    frontmatterEnd: bodyStart,
    descriptionStart,
    descriptionEnd,
    commentsStart,
    commentsEnd,
  };
}

export function parseComments(commentsBody: string): Comment[] {
  const lines = commentsBody.split('\n');
  const comments: Comment[] = [];
  let current: { author: string; timestamp: string; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    comments.push({
      id: `${current.timestamp}#${comments.length}`,
      author: current.author,
      timestamp: current.timestamp,
      body: current.body.join('\n').trim(),
    });
    current = null;
  };

  for (const line of lines) {
    const m = COMMENT_RE.exec(line);
    if (m) {
      flush();
      current = { author: m[1], timestamp: m[2], body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  flush();
  return comments;
}

function basename(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  return file.endsWith('.md') ? file.slice(0, -3) : file;
}

export function parseTask(
  path: string,
  frontmatter: Record<string, unknown>,
  content: string,
): Task {
  const parseErrors: string[] = [];
  const sections = locateSections(content);

  const id = typeof frontmatter.id === 'string' ? frontmatter.id : null;
  if (id === null) parseErrors.push('Missing "id" in frontmatter.');

  const title =
    typeof frontmatter.title === 'string' && frontmatter.title.length > 0
      ? frontmatter.title
      : basename(path);

  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!RESERVED.has(k)) fields[k] = v;
  }

  const description =
    sections.descriptionStart === -1
      ? ''
      : content.slice(sections.descriptionStart, sections.descriptionEnd).trim();

  const comments =
    sections.commentsStart === -1
      ? []
      : parseComments(content.slice(sections.commentsStart, sections.commentsEnd));

  return {
    path,
    id,
    title,
    fields,
    description,
    comments,
    created: typeof frontmatter.created === 'string' ? frontmatter.created : null,
    updated: typeof frontmatter.updated === 'string' ? frontmatter.updated : null,
    parseErrors,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/model`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/model tests/model
git commit -m "feat: add task markdown parsing"
```

---

### Task 5: Task model — body editing

**Files:**
- Create: `src/model/edit.ts`
- Test: `tests/model/edit.test.ts`

**Interfaces:**
- Consumes: `locateSections`, `parseComments`, `splitFrontmatter` from Task 4.
- Produces:
  - `function setDescription(content: string, description: string): string`
  - `function addComment(content: string, author: string, timestamp: string, body: string): string`
  - `function editComment(content: string, commentId: string, body: string): string`
  - `function deleteComment(content: string, commentId: string): string`
  - `function formatComment(author: string, timestamp: string, body: string): string`

  Every function returns new file content and **preserves everything it does not own** — other sections, ordering, and text outside the managed ranges. When the target section is absent, it is appended.

- [ ] **Step 1: Write the failing tests**

`tests/model/edit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addComment, deleteComment, editComment, setDescription } from '../../src/model/edit';
import { locateSections, parseComments } from '../../src/model/parse';

const FILE = `---
id: TASK-42
title: Fix login redirect
---

## Description

Old description.

## Notes

Hand-written notes that must survive.

## Comments

### Ahmed — 2026-09-21T09:10:00
First comment.

### Sam — 2026-09-22T11:02:00
Second comment.
`;

const commentsOf = (content: string) => {
  const s = locateSections(content);
  return s.commentsStart === -1 ? [] : parseComments(content.slice(s.commentsStart, s.commentsEnd));
};

describe('setDescription', () => {
  it('replaces the description body', () => {
    const out = setDescription(FILE, 'New description.');
    const s = locateSections(out);
    expect(out.slice(s.descriptionStart, s.descriptionEnd).trim()).toBe('New description.');
  });

  it('preserves unrelated sections', () => {
    const out = setDescription(FILE, 'New description.');
    expect(out).toContain('Hand-written notes that must survive.');
    expect(out).toContain('## Notes');
  });

  it('preserves frontmatter byte-for-byte', () => {
    const out = setDescription(FILE, 'New description.');
    expect(out.startsWith('---\nid: TASK-42\ntitle: Fix login redirect\n---\n')).toBe(true);
  });

  it('preserves the comments', () => {
    const out = setDescription(FILE, 'New description.');
    expect(commentsOf(out)).toHaveLength(2);
  });

  it('appends a Description section when absent', () => {
    const bare = '---\nid: T-1\n---\n';
    const out = setDescription(bare, 'Hello.');
    expect(out).toContain('## Description');
    const s = locateSections(out);
    expect(out.slice(s.descriptionStart, s.descriptionEnd).trim()).toBe('Hello.');
  });

  it('is idempotent', () => {
    const once = setDescription(FILE, 'Same.');
    expect(setDescription(once, 'Same.')).toBe(once);
  });
});

describe('addComment', () => {
  it('appends a third comment', () => {
    const out = addComment(FILE, 'Ahmed', '2026-09-23T08:00:00', 'Third comment.');
    const cs = commentsOf(out);
    expect(cs).toHaveLength(3);
    expect(cs[2].body).toBe('Third comment.');
    expect(cs[2].author).toBe('Ahmed');
  });

  it('creates the Comments section when absent', () => {
    const bare = '---\nid: T-1\n---\n\n## Description\n\nBody.\n';
    const out = addComment(bare, 'Ahmed', '2026-09-23T08:00:00', 'Hi.');
    expect(commentsOf(out)).toHaveLength(1);
    expect(out).toContain('Body.');
  });

  it('preserves a multi-line body', () => {
    const out = addComment(FILE, 'Ahmed', '2026-09-23T08:00:00', 'line one\nline two');
    expect(commentsOf(out)[2].body).toBe('line one\nline two');
  });
});

describe('editComment', () => {
  it('replaces one comment body and leaves the others alone', () => {
    const target = commentsOf(FILE)[0].id;
    const out = editComment(FILE, target, 'Edited first.');
    const cs = commentsOf(out);
    expect(cs[0].body).toBe('Edited first.');
    expect(cs[1].body).toBe('Second comment.');
    expect(cs[0].author).toBe('Ahmed');
    expect(cs[0].timestamp).toBe('2026-09-21T09:10:00');
  });

  it('returns the content unchanged for an unknown id', () => {
    expect(editComment(FILE, 'nope#9', 'x')).toBe(FILE);
  });
});

describe('deleteComment', () => {
  it('removes one comment', () => {
    const target = commentsOf(FILE)[0].id;
    const out = deleteComment(FILE, target);
    const cs = commentsOf(out);
    expect(cs).toHaveLength(1);
    expect(cs[0].body).toBe('Second comment.');
  });

  it('preserves other sections', () => {
    const target = commentsOf(FILE)[0].id;
    expect(deleteComment(FILE, target)).toContain('Hand-written notes that must survive.');
  });

  it('returns the content unchanged for an unknown id', () => {
    expect(deleteComment(FILE, 'nope#9')).toBe(FILE);
  });

  it('leaves an empty Comments section when the last comment goes', () => {
    let out = FILE;
    for (const c of commentsOf(FILE)) out = deleteComment(out, commentsOf(out)[0].id);
    expect(commentsOf(out)).toEqual([]);
    expect(out).toContain('## Comments');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/model/edit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/model/edit.ts`**

```ts
import { locateSections, parseComments } from './parse';
import type { Comment } from './types';

export function formatComment(author: string, timestamp: string, body: string): string {
  return `### ${author} \u2014 ${timestamp}\n${body.trim()}\n`;
}

/**
 * Replace the byte range a section owns, or append the section when absent.
 * Padding is deterministic in both paths, which is what makes the writers
 * idempotent: writing the same value twice produces identical bytes.
 */
function replaceSection(
  content: string,
  title: string,
  range: [number, number],
  body: string,
): string {
  const inner = body.trim();
  const padded = inner.length > 0 ? `\n\n${inner}\n\n` : '\n\n';
  if (range[0] === -1) {
    const sep = content.endsWith('\n') ? '' : '\n';
    return `${content}${sep}\n## ${title}${padded}`;
  }
  return content.slice(0, range[0]) + padded + content.slice(range[1]);
}

export function setDescription(content: string, description: string): string {
  const s = locateSections(content);
  return replaceSection(content, 'Description', [s.descriptionStart, s.descriptionEnd], description);
}

function renderComments(comments: Comment[]): string {
  return comments
    .map((c) => formatComment(c.author, c.timestamp, c.body))
    .join('\n');
}

/** Returning null from `transform` means "no such comment" and leaves content alone. */
function withComments(
  content: string,
  transform: (cs: Comment[]) => Comment[] | null,
): string {
  const s = locateSections(content);
  const existing =
    s.commentsStart === -1 ? [] : parseComments(content.slice(s.commentsStart, s.commentsEnd));
  const next = transform(existing);
  if (next === null) return content;
  return replaceSection(content, 'Comments', [s.commentsStart, s.commentsEnd], renderComments(next));
}

export function addComment(
  content: string,
  author: string,
  timestamp: string,
  body: string,
): string {
  return withComments(content, (cs) => [
    ...cs,
    { id: `${timestamp}#${cs.length}`, author, timestamp, body: body.trim() },
  ]);
}

export function editComment(content: string, commentId: string, body: string): string {
  return withComments(content, (cs) => {
    if (!cs.some((c) => c.id === commentId)) return null;
    return cs.map((c) => (c.id === commentId ? { ...c, body: body.trim() } : c));
  });
}

export function deleteComment(content: string, commentId: string): string {
  return withComments(content, (cs) => {
    if (!cs.some((c) => c.id === commentId)) return null;
    return cs.filter((c) => c.id !== commentId);
  });
}
```

Note the em dash in `formatComment` must match the one `COMMENT_RE` in
`parse.ts` expects (U+2014), not a hyphen.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/model`
Expected: all PASS. If the idempotence test fails, `replaceSection` is
producing different padding on the append and replace paths — both must emit
exactly one blank line before and after the body.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/model/edit.ts tests/model/edit.test.ts
git commit -m "feat: add section-preserving task body editing"
```

---

### Task 6: Query — search, filter, sort, group

**Files:**
- Create: `src/query/types.ts`
- Create: `src/query/apply.ts`
- Test: `tests/query/apply.test.ts`

**Interfaces:**
- Consumes: `Task` from Task 4, `FieldDef` from Task 2.
- Produces:
  - `interface Query { search: string; filters: Record<string, string[]>; sortKey: string; sortDir: 'asc' | 'desc'; groupBy: string | null; hideDone: boolean }`
  - `interface Group { key: string; tasks: Task[] }`
  - `const EMPTY_QUERY: Query`
  - `function applyQuery(tasks: Task[], query: Query, schema: FieldDef[], doneOptions: string[], statusKey: string): Group[]`

  Filter semantics: within one field, the selected values are OR'd; across fields, AND. An empty array for a field means "no filter on this field".

- [ ] **Step 1: Write the failing tests**

`tests/query/apply.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_QUERY, applyQuery } from '../../src/query/apply';
import type { Query } from '../../src/query/types';
import type { Task } from '../../src/model/types';
import type { FieldDef } from '../../src/schema/types';

const schema: FieldDef[] = [
  { key: 'status', label: 'Status', type: 'select', options: ['To Do', 'In Progress', 'Done'], order: 0 },
  { key: 'assignee', label: 'Assignee', type: 'person', order: 1 },
  { key: 'due', label: 'Due', type: 'date', order: 2 },
];

const task = (over: Partial<Task> & { id: string }): Task => ({
  path: `Tasks/${over.id}.md`,
  title: over.id,
  fields: {},
  description: '',
  comments: [],
  created: null,
  updated: null,
  parseErrors: [],
  ...over,
});

const tasks: Task[] = [
  task({ id: 'TASK-1', title: 'Fix login redirect', fields: { status: 'In Progress', assignee: 'Ahmed', due: '2026-09-25' }, updated: '2026-09-20T10:00:00' }),
  task({ id: 'TASK-2', title: 'Update docs', description: 'Mentions login flow.', fields: { status: 'To Do', assignee: 'Sam', due: '2026-09-22' }, updated: '2026-09-21T10:00:00' }),
  task({ id: 'TASK-3', title: 'Ship release', fields: { status: 'Done', assignee: 'Ahmed', due: '2026-09-19' }, updated: '2026-09-19T10:00:00' }),
];

const q = (over: Partial<Query> = {}): Query => ({ ...EMPTY_QUERY, ...over });
const run = (query: Query) => applyQuery(tasks, query, schema, ['Done'], 'status');
const idsOf = (groups: { tasks: Task[] }[]) => groups.flatMap((g) => g.tasks.map((t) => t.id));

describe('applyQuery', () => {
  it('returns every task in one group by default', () => {
    const groups = run(q());
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks).toHaveLength(3);
  });

  it('matches search against the title, case-insensitively', () => {
    expect(idsOf(run(q({ search: 'LOGIN redirect' })))).toEqual(['TASK-1']);
  });

  it('matches search against the description', () => {
    expect(idsOf(run(q({ search: 'login flow' })))).toContain('TASK-2');
  });

  it('matches search against the id', () => {
    expect(idsOf(run(q({ search: 'task-3' })))).toEqual(['TASK-3']);
  });

  it('ORs values within one filter field', () => {
    const ids = idsOf(run(q({ filters: { status: ['To Do', 'Done'] } })));
    expect(ids.sort()).toEqual(['TASK-2', 'TASK-3']);
  });

  it('ANDs across filter fields', () => {
    const ids = idsOf(run(q({ filters: { status: ['Done'], assignee: ['Ahmed'] } })));
    expect(ids).toEqual(['TASK-3']);
  });

  it('ignores a filter field with an empty value list', () => {
    expect(idsOf(run(q({ filters: { status: [] } })))).toHaveLength(3);
  });

  it('hides done tasks when asked', () => {
    const ids = idsOf(run(q({ hideDone: true })));
    expect(ids).not.toContain('TASK-3');
    expect(ids).toHaveLength(2);
  });

  it('sorts by a date field ascending', () => {
    expect(idsOf(run(q({ sortKey: 'due', sortDir: 'asc' }))))
      .toEqual(['TASK-3', 'TASK-2', 'TASK-1']);
  });

  it('sorts descending', () => {
    expect(idsOf(run(q({ sortKey: 'due', sortDir: 'desc' }))))
      .toEqual(['TASK-1', 'TASK-2', 'TASK-3']);
  });

  it('sorts empty values last regardless of direction', () => {
    const withBlank = [...tasks, task({ id: 'TASK-4', fields: { status: 'To Do' } })];
    const asc = applyQuery(withBlank, q({ sortKey: 'due', sortDir: 'asc' }), schema, ['Done'], 'status');
    const desc = applyQuery(withBlank, q({ sortKey: 'due', sortDir: 'desc' }), schema, ['Done'], 'status');
    expect(idsOf(asc).at(-1)).toBe('TASK-4');
    expect(idsOf(desc).at(-1)).toBe('TASK-4');
  });

  it('sorts by title when sortKey is title', () => {
    expect(idsOf(run(q({ sortKey: 'title', sortDir: 'asc' }))))
      .toEqual(['TASK-1', 'TASK-3', 'TASK-2']);
  });

  it('groups by a field, one group per distinct value', () => {
    const groups = run(q({ groupBy: 'assignee' }));
    expect(groups.map((g) => g.key).sort()).toEqual(['Ahmed', 'Sam']);
    expect(groups.find((g) => g.key === 'Ahmed')?.tasks).toHaveLength(2);
  });

  it('puts tasks with no value into a "No value" group, last', () => {
    const withBlank = [...tasks, task({ id: 'TASK-4' })];
    const groups = applyQuery(withBlank, q({ groupBy: 'assignee' }), schema, ['Done'], 'status');
    expect(groups.at(-1)?.key).toBe('No value');
  });

  it('orders status groups by the schema option order, not alphabetically', () => {
    const groups = run(q({ groupBy: 'status' }));
    expect(groups.map((g) => g.key)).toEqual(['To Do', 'In Progress', 'Done']);
  });

  it('combines search, filter and sort', () => {
    const ids = idsOf(run(q({ search: 'a', filters: { assignee: ['Ahmed'] }, sortKey: 'due', sortDir: 'asc' })));
    expect(ids).toEqual(['TASK-3', 'TASK-1']);
  });

  it('does not mutate the input array', () => {
    const before = tasks.map((t) => t.id);
    run(q({ sortKey: 'due', sortDir: 'desc' }));
    expect(tasks.map((t) => t.id)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/query`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/query/types.ts`**

```ts
import type { Task } from '../model/types';

export interface Query {
  search: string;
  /** field key -> selected values. Empty array means no filter on that field. */
  filters: Record<string, string[]>;
  /** A schema field key, or 'title' / 'updated' / 'created' / 'id'. */
  sortKey: string;
  sortDir: 'asc' | 'desc';
  /** A schema field key, or null for a single flat group. */
  groupBy: string | null;
  hideDone: boolean;
}

export interface Group {
  key: string;
  tasks: Task[];
}

export const NO_VALUE_GROUP = 'No value';
```

- [ ] **Step 4: Create `src/query/apply.ts`**

```ts
import type { Task } from '../model/types';
import type { FieldDef } from '../schema/types';
import { NO_VALUE_GROUP, type Group, type Query } from './types';

export { NO_VALUE_GROUP } from './types';
export type { Group, Query } from './types';

export const EMPTY_QUERY: Query = {
  search: '',
  filters: {},
  sortKey: 'updated',
  sortDir: 'desc',
  groupBy: null,
  hideDone: false,
};

/** Every value a task holds for `key`, as strings. Multiselect yields many. */
function valuesOf(task: Task, key: string): string[] {
  if (key === 'title') return [task.title];
  if (key === 'id') return task.id ? [task.id] : [];
  if (key === 'created') return task.created ? [task.created] : [];
  if (key === 'updated') return task.updated ? [task.updated] : [];

  const raw = task.fields[key];
  if (raw === null || raw === undefined || raw === '') return [];
  if (Array.isArray(raw)) return raw.map(String);
  return [String(raw)];
}

function matchesSearch(task: Task, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (q === '') return true;
  const haystack = [task.title, task.description, task.id ?? ''].join('\n').toLowerCase();
  return haystack.includes(q);
}

function matchesFilters(task: Task, filters: Record<string, string[]>): boolean {
  for (const [key, wanted] of Object.entries(filters)) {
    if (wanted.length === 0) continue;
    const have = valuesOf(task, key);
    if (!have.some((v) => wanted.includes(v))) return false;
  }
  return true;
}

function compare(a: Task, b: Task, key: string, dir: 'asc' | 'desc'): number {
  const av = valuesOf(a, key)[0];
  const bv = valuesOf(b, key)[0];

  // Empty values always sort last, whichever direction is active.
  if (av === undefined && bv === undefined) return 0;
  if (av === undefined) return 1;
  if (bv === undefined) return -1;

  const an = Number(av);
  const bn = Number(bv);
  const cmp =
    Number.isFinite(an) && Number.isFinite(bn) && av.trim() !== '' && bv.trim() !== ''
      ? an - bn
      : av.localeCompare(bv);

  return dir === 'asc' ? cmp : -cmp;
}

function groupOrder(key: string, schema: FieldDef[]): string[] | null {
  const def = schema.find((f) => f.key === key);
  return def?.options && def.options.length > 0 ? def.options : null;
}

export function applyQuery(
  tasks: Task[],
  query: Query,
  schema: FieldDef[],
  doneOptions: string[],
  statusKey: string,
): Group[] {
  const filtered = tasks.filter((t) => {
    if (!matchesSearch(t, query.search)) return false;
    if (!matchesFilters(t, query.filters)) return false;
    if (query.hideDone && valuesOf(t, statusKey).some((v) => doneOptions.includes(v))) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => compare(a, b, query.sortKey, query.sortDir));

  if (query.groupBy === null) {
    return [{ key: '', tasks: sorted }];
  }

  const buckets = new Map<string, Task[]>();
  for (const t of sorted) {
    const vals = valuesOf(t, query.groupBy);
    const keys = vals.length > 0 ? vals : [NO_VALUE_GROUP];
    for (const k of keys) {
      const list = buckets.get(k) ?? [];
      list.push(t);
      buckets.set(k, list);
    }
  }

  const declared = groupOrder(query.groupBy, schema);
  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === NO_VALUE_GROUP) return 1;
    if (b === NO_VALUE_GROUP) return -1;
    if (declared) {
      const ai = declared.indexOf(a);
      const bi = declared.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
    }
    return a.localeCompare(b);
  });

  return keys.map((k) => ({ key: k, tasks: buckets.get(k) ?? [] }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/query`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/query tests/query
git commit -m "feat: add task search, filter, sort and grouping"
```

---

### Task 7: Settings model and plugin settings persistence

**Files:**
- Create: `src/settings/types.ts`
- Create: `src/settings/defaults.ts`
- Test: `tests/settings/defaults.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `FieldDef`, `DEFAULT_SCHEMA` from Task 2.
- Produces:
  - `interface TaskTrackerSettings { tasksFolder: string; idPrefix: string; authorName: string; schema: FieldDef[]; statusFieldKey: string; doneStatuses: string[]; dueFieldKey: string | null }`
  - `const DEFAULT_SETTINGS: TaskTrackerSettings`
  - `function mergeSettings(saved: unknown): TaskTrackerSettings` — tolerates a missing or partial `data.json`.
  - On the plugin: `settings: TaskTrackerSettings`, `saveSettings(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`tests/settings/defaults.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../../src/settings/defaults';

describe('DEFAULT_SETTINGS', () => {
  it('points at a flat Tasks folder', () => {
    expect(DEFAULT_SETTINGS.tasksFolder).toBe('Tasks');
  });

  it('names a status field that exists in the default schema', () => {
    expect(DEFAULT_SETTINGS.schema.some((f) => f.key === DEFAULT_SETTINGS.statusFieldKey)).toBe(true);
  });

  it('marks Done as a done status', () => {
    expect(DEFAULT_SETTINGS.doneStatuses).toContain('Done');
  });
});

describe('mergeSettings', () => {
  it('returns defaults for null', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for a non-object', () => {
    expect(mergeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps saved scalar values', () => {
    const merged = mergeSettings({ idPrefix: 'OPS', authorName: 'Ahmed' });
    expect(merged.idPrefix).toBe('OPS');
    expect(merged.authorName).toBe('Ahmed');
    expect(merged.tasksFolder).toBe('Tasks');
  });

  it('keeps a saved schema rather than merging it with defaults', () => {
    const merged = mergeSettings({ schema: [{ key: 'only', label: 'Only', type: 'text', order: 0 }] });
    expect(merged.schema).toHaveLength(1);
    expect(merged.schema[0].key).toBe('only');
  });

  it('falls back to the default schema when the saved one is not an array', () => {
    expect(mergeSettings({ schema: 'oops' }).schema).toEqual(DEFAULT_SETTINGS.schema);
  });

  it('falls back to the default schema when the saved one is empty', () => {
    expect(mergeSettings({ schema: [] }).schema).toEqual(DEFAULT_SETTINGS.schema);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/settings/types.ts`**

```ts
import type { FieldDef } from '../schema/types';

export interface TaskTrackerSettings {
  /** Vault-relative folder holding task files. Flat; subfolders are ignored. */
  tasksFolder: string;
  /** ID prefix, e.g. 'TASK' produces TASK-1. */
  idPrefix: string;
  /** Author name stamped on comments. */
  authorName: string;
  schema: FieldDef[];
  /** Which schema field carries status. */
  statusFieldKey: string;
  /** Options of the status field that count as done. */
  doneStatuses: string[];
  /** Which schema field drives the due badge, or null to disable it. */
  dueFieldKey: string | null;
}
```

- [ ] **Step 4: Create `src/settings/defaults.ts`**

```ts
import { DEFAULT_SCHEMA } from '../schema/defaults';
import type { TaskTrackerSettings } from './types';

export const DEFAULT_SETTINGS: TaskTrackerSettings = {
  tasksFolder: 'Tasks',
  idPrefix: 'TASK',
  authorName: 'Me',
  schema: DEFAULT_SCHEMA,
  statusFieldKey: 'status',
  doneStatuses: ['Done'],
  dueFieldKey: 'due',
};

export function mergeSettings(saved: unknown): TaskTrackerSettings {
  if (saved === null || typeof saved !== 'object') return { ...DEFAULT_SETTINGS };
  const s = saved as Partial<TaskTrackerSettings>;

  const schema =
    Array.isArray(s.schema) && s.schema.length > 0 ? s.schema : DEFAULT_SETTINGS.schema;

  return {
    ...DEFAULT_SETTINGS,
    ...s,
    schema,
  };
}
```

- [ ] **Step 5: Wire settings into `src/main.ts`**

```ts
import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, mergeSettings } from './settings/defaults';
import type { TaskTrackerSettings } from './settings/types';

export default class TaskTrackerPlugin extends Plugin {
  settings: TaskTrackerSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/settings src/main.ts tests/settings
git commit -m "feat: add plugin settings model and persistence"
```

---

### Task 8: Vault writer

**Files:**
- Create: `src/write/vault.ts`
- Create: `src/write/writer.ts`
- Test: `tests/write/writer.test.ts`

**Interfaces:**
- Consumes: `setDescription`, `addComment`, `editComment`, `deleteComment` from Task 5; `TaskTrackerSettings` from Task 7.
- Produces:
  - `interface VaultAdapter { read(path: string): Promise<string>; write(path: string, content: string): Promise<void>; create(path: string, content: string): Promise<void>; rename(from: string, to: string): Promise<void>; exists(path: string): Promise<boolean>; list(folder: string): Promise<string[]> }`
  - `class TaskWriter` with:
    - `constructor(vault: VaultAdapter, settings: () => TaskTrackerSettings)`
    - `nextId(existingIds: string[]): string`
    - `createTask(title: string, fields: Record<string, unknown>, existingIds: string[]): Promise<string>` → new path
    - `setField(path: string, key: string, value: unknown): Promise<void>`
    - `setTitle(path: string, title: string): Promise<string>` → resulting path
    - `setDescriptionAt(path: string, description: string): Promise<void>`
    - `addCommentAt(path: string, body: string, now?: Date): Promise<void>`
    - `editCommentAt(path: string, commentId: string, body: string): Promise<void>`
    - `deleteCommentAt(path: string, commentId: string): Promise<void>`
  - `function formatTimestamp(d: Date): string` — `YYYY-MM-DDTHH:mm:ss` local time.
  - `function sanitizeFilename(s: string): string`

  `VaultAdapter` is a narrow interface precisely so the writer is testable with an in-memory fake; the Obsidian-backed implementation lands in Task 10.

- [ ] **Step 1: Write the failing tests**

`tests/write/writer.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { TaskWriter, formatTimestamp, sanitizeFilename } from '../../src/write/writer';
import type { VaultAdapter } from '../../src/write/vault';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { locateSections, parseComments } from '../../src/model/parse';

class FakeVault implements VaultAdapter {
  files = new Map<string, string>();
  async read(p: string) {
    const v = this.files.get(p);
    if (v === undefined) throw new Error(`no such file: ${p}`);
    return v;
  }
  async write(p: string, c: string) { this.files.set(p, c); }
  async create(p: string, c: string) {
    if (this.files.has(p)) throw new Error('exists');
    this.files.set(p, c);
  }
  async rename(from: string, to: string) {
    const c = await this.read(from);
    this.files.delete(from);
    this.files.set(to, c);
  }
  async exists(p: string) { return this.files.has(p); }
  async list(folder: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(`${folder}/`));
  }
}

let vault: FakeVault;
let writer: TaskWriter;
const settings = () => ({ ...DEFAULT_SETTINGS, authorName: 'Ahmed' });

beforeEach(() => {
  vault = new FakeVault();
  writer = new TaskWriter(vault, settings);
});

describe('formatTimestamp', () => {
  it('formats to seconds precision without a timezone', () => {
    expect(formatTimestamp(new Date(2026, 8, 21, 9, 5, 3))).toBe('2026-09-21T09:05:03');
  });
});

describe('sanitizeFilename', () => {
  it('strips characters that are illegal in filenames', () => {
    expect(sanitizeFilename('a/b:c*d?e"f<g>h|i')).toBe('abcdefghi');
  });
  it('collapses whitespace and trims', () => {
    expect(sanitizeFilename('  too   many   spaces  ')).toBe('too many spaces');
  });
});

describe('nextId', () => {
  it('starts at 1 for an empty vault', () => {
    expect(writer.nextId([])).toBe('TASK-1');
  });
  it('takes one past the numeric maximum, not the count', () => {
    expect(writer.nextId(['TASK-1', 'TASK-7', 'TASK-3'])).toBe('TASK-8');
  });
  it('ignores ids with a different prefix', () => {
    expect(writer.nextId(['OPS-99', 'TASK-2'])).toBe('TASK-3');
  });
  it('ignores malformed ids', () => {
    expect(writer.nextId(['TASK-abc', 'TASK-4'])).toBe('TASK-5');
  });
});

describe('createTask', () => {
  it('writes a file whose name carries id and title', async () => {
    const path = await writer.createTask('Fix login redirect', { status: 'To Do' }, []);
    expect(path).toBe('Tasks/TASK-1 Fix login redirect.md');
    expect(vault.files.has(path)).toBe(true);
  });

  it('writes frontmatter, description and comments scaffolding', async () => {
    const path = await writer.createTask('Fix login', { status: 'To Do' }, []);
    const content = await vault.read(path);
    expect(content).toContain('id: TASK-1');
    expect(content).toContain('title: Fix login');
    expect(content).toContain('status: To Do');
    expect(content).toContain('## Description');
    expect(content).toContain('## Comments');
  });

  it('stamps created and updated', async () => {
    const path = await writer.createTask('X', {}, []);
    const content = await vault.read(path);
    expect(content).toMatch(/created: \d{4}-\d{2}-\d{2}T/);
    expect(content).toMatch(/updated: \d{4}-\d{2}-\d{2}T/);
  });

  it('serializes array values as YAML lists', async () => {
    const path = await writer.createTask('X', { labels: ['auth', 'ui'] }, []);
    expect(await vault.read(path)).toContain('labels: [auth, ui]');
  });

  it('omits empty values', async () => {
    const path = await writer.createTask('X', { assignee: '', labels: [] }, []);
    const content = await vault.read(path);
    expect(content).not.toContain('assignee:');
    expect(content).not.toContain('labels:');
  });

  it('suffixes the filename on collision rather than overwriting', async () => {
    await vault.write('Tasks/TASK-1 X.md', 'pre-existing');
    const path = await writer.createTask('X', {}, []);
    expect(path).not.toBe('Tasks/TASK-1 X.md');
    expect(await vault.read('Tasks/TASK-1 X.md')).toBe('pre-existing');
  });
});

describe('setField', () => {
  it('updates one frontmatter value and stamps updated', async () => {
    const path = await writer.createTask('X', { status: 'To Do' }, []);
    const before = await vault.read(path);
    await writer.setField(path, 'status', 'Done');
    const after = await vault.read(path);
    expect(after).toContain('status: Done');
    expect(after).not.toContain('status: To Do');
    expect(after).not.toBe(before);
  });

  it('adds a key that was not present', async () => {
    const path = await writer.createTask('X', {}, []);
    await writer.setField(path, 'priority', 'High');
    expect(await vault.read(path)).toContain('priority: High');
  });

  it('removes the key when the value is empty', async () => {
    const path = await writer.createTask('X', { status: 'To Do' }, []);
    await writer.setField(path, 'status', null);
    expect(await vault.read(path)).not.toContain('status:');
  });

  it('leaves the body untouched', async () => {
    const path = await writer.createTask('X', {}, []);
    await writer.setDescriptionAt(path, 'Body text.');
    await writer.setField(path, 'status', 'Done');
    const content = await vault.read(path);
    const s = locateSections(content);
    expect(content.slice(s.descriptionStart, s.descriptionEnd).trim()).toBe('Body text.');
  });
});

describe('setTitle', () => {
  it('renames the file and updates the frontmatter title', async () => {
    const path = await writer.createTask('Old name', {}, []);
    const next = await writer.setTitle(path, 'New name');
    expect(next).toBe('Tasks/TASK-1 New name.md');
    expect(await vault.read(next)).toContain('title: New name');
    expect(vault.files.has(path)).toBe(false);
  });

  it('keeps the old filename when the target already exists', async () => {
    const path = await writer.createTask('Old name', {}, []);
    await vault.write('Tasks/TASK-1 Taken.md', 'other');
    const next = await writer.setTitle(path, 'Taken');
    expect(next).toBe(path);
    expect(await vault.read(path)).toContain('title: Taken');
    expect(await vault.read('Tasks/TASK-1 Taken.md')).toBe('other');
  });
});

describe('comments', () => {
  it('appends a comment authored by the configured name', async () => {
    const path = await writer.createTask('X', {}, []);
    await writer.addCommentAt(path, 'First note.', new Date(2026, 8, 21, 9, 10, 0));
    const content = await vault.read(path);
    const s = locateSections(content);
    const cs = parseComments(content.slice(s.commentsStart, s.commentsEnd));
    expect(cs).toHaveLength(1);
    expect(cs[0].author).toBe('Ahmed');
    expect(cs[0].timestamp).toBe('2026-09-21T09:10:00');
    expect(cs[0].body).toBe('First note.');
  });

  it('edits and deletes by comment id', async () => {
    const path = await writer.createTask('X', {}, []);
    await writer.addCommentAt(path, 'One.', new Date(2026, 8, 21, 9, 10, 0));
    await writer.addCommentAt(path, 'Two.', new Date(2026, 8, 21, 9, 11, 0));

    const read = async () => {
      const c = await vault.read(path);
      const s = locateSections(c);
      return parseComments(c.slice(s.commentsStart, s.commentsEnd));
    };

    await writer.editCommentAt(path, (await read())[0].id, 'One edited.');
    expect((await read())[0].body).toBe('One edited.');

    await writer.deleteCommentAt(path, (await read())[0].id);
    const left = await read();
    expect(left).toHaveLength(1);
    expect(left[0].body).toBe('Two.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/write`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/write/vault.ts`**

```ts
/**
 * The narrow slice of vault behaviour the writer needs. Implemented over
 * Obsidian in Task 10 and over a Map in tests.
 */
export interface VaultAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  create(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Vault-relative paths directly inside `folder`. */
  list(folder: string): Promise<string[]>;
}
```

- [ ] **Step 4: Create `src/write/writer.ts`**

```ts
import { addComment, deleteComment, editComment, setDescription } from '../model/edit';
import { splitFrontmatter } from '../model/parse';
import type { TaskTrackerSettings } from '../settings/types';
import type { VaultAdapter } from './vault';

const ILLEGAL = /[\\/:*?"<>|#^[\]]/g;

export function sanitizeFilename(s: string): string {
  return s.replace(ILLEGAL, '').replace(/\s+/g, ' ').trim();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatTimestamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

/** YAML scalar rendering for the small set of shapes a field value can take. */
function yamlValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(String).join(', ')}]`;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  return /[:#]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
}

/** Rewrite one key in a frontmatter block. Empty value removes the key. */
function setFrontmatterKey(content: string, key: string, value: unknown): string {
  const { frontmatter, bodyStart } = splitFrontmatter(content);
  const lines = frontmatter.split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`${key}:`));

  if (isEmptyValue(value)) {
    if (idx === -1) return content;
    lines.splice(idx, 1);
  } else {
    const line = `${key}: ${yamlValue(value)}`;
    if (idx === -1) lines.push(line);
    else lines[idx] = line;
  }

  const body = content.slice(bodyStart);
  return `---\n${lines.filter((l) => l.length > 0).join('\n')}\n---${body}`;
}

export class TaskWriter {
  constructor(
    private vault: VaultAdapter,
    private settings: () => TaskTrackerSettings,
  ) {}

  nextId(existingIds: string[]): string {
    const prefix = this.settings().idPrefix;
    const re = new RegExp(`^${prefix}-(\\d+)$`);
    let max = 0;
    for (const id of existingIds) {
      const m = re.exec(id);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefix}-${max + 1}`;
  }

  private async freePath(base: string): Promise<string> {
    if (!(await this.vault.exists(base))) return base;
    const stem = base.slice(0, -3);
    for (let n = 2; n < 100; n++) {
      const candidate = `${stem} (${n}).md`;
      if (!(await this.vault.exists(candidate))) return candidate;
    }
    throw new Error(`Could not find a free filename for ${base}`);
  }

  async createTask(
    title: string,
    fields: Record<string, unknown>,
    existingIds: string[],
  ): Promise<string> {
    const { tasksFolder } = this.settings();
    const id = this.nextId(existingIds);
    const now = formatTimestamp(new Date());

    const fm = [`id: ${id}`, `title: ${yamlValue(title)}`];
    for (const [k, v] of Object.entries(fields)) {
      if (!isEmptyValue(v)) fm.push(`${k}: ${yamlValue(v)}`);
    }
    fm.push(`created: ${now}`, `updated: ${now}`);

    const content = `---\n${fm.join('\n')}\n---\n\n## Description\n\n\n\n## Comments\n\n`;
    const path = await this.freePath(
      `${tasksFolder}/${sanitizeFilename(`${id} ${title}`)}.md`,
    );
    await this.vault.create(path, content);
    return path;
  }

  private async touch(path: string, transform: (content: string) => string): Promise<void> {
    const content = await this.vault.read(path);
    const next = setFrontmatterKey(transform(content), 'updated', formatTimestamp(new Date()));
    await this.vault.write(path, next);
  }

  async setField(path: string, key: string, value: unknown): Promise<void> {
    await this.touch(path, (c) => setFrontmatterKey(c, key, value));
  }

  async setTitle(path: string, title: string): Promise<string> {
    const { tasksFolder } = this.settings();
    await this.touch(path, (c) => setFrontmatterKey(c, 'title', title));

    const content = await this.vault.read(path);
    const idMatch = /^id:\s*(\S+)\s*$/m.exec(splitFrontmatter(content).frontmatter);
    if (!idMatch) return path;

    const target = `${tasksFolder}/${sanitizeFilename(`${idMatch[1]} ${title}`)}.md`;
    if (target === path) return path;
    if (await this.vault.exists(target)) return path;

    await this.vault.rename(path, target);
    return target;
  }

  async setDescriptionAt(path: string, description: string): Promise<void> {
    await this.touch(path, (c) => setDescription(c, description));
  }

  async addCommentAt(path: string, body: string, now: Date = new Date()): Promise<void> {
    const author = this.settings().authorName;
    await this.touch(path, (c) => addComment(c, author, formatTimestamp(now), body));
  }

  async editCommentAt(path: string, commentId: string, body: string): Promise<void> {
    await this.touch(path, (c) => editComment(c, commentId, body));
  }

  async deleteCommentAt(path: string, commentId: string): Promise<void> {
    await this.touch(path, (c) => deleteComment(c, commentId));
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/write`
Expected: all PASS.

- [ ] **Step 6: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/write tests/write
git commit -m "feat: add vault writer for tasks, fields and comments"
```

---

### Task 9: Task index over metadataCache

**Files:**
- Create: `src/index/taskIndex.ts`
- Create: `src/write/obsidianVault.ts`
- Test: `tests/index/taskIndex.test.ts`

**Interfaces:**
- Consumes: `parseTask` from Task 4, `TaskTrackerSettings` from Task 7, `VaultAdapter` from Task 8.
- Produces:
  - `interface MetadataSource { pathsIn(folder: string): string[]; frontmatterOf(path: string): Record<string, unknown> | null; read(path: string): Promise<string> }`
  - `class TaskIndex` with `rebuild(): Promise<void>`, `all(): Task[]`, `get(path: string): Task | undefined`, `ids(): string[]`, `updateOne(path: string): Promise<void>`, `remove(path: string): void`, `loadBody(path: string): Promise<Task | undefined>`, `duplicateIds(): Set<string>`, `onChange(cb: () => void): () => void`
  - `class ObsidianVaultAdapter implements VaultAdapter` — the real implementation, constructed from `App`.

  `TaskIndex` takes a `MetadataSource` rather than `App` so it stays unit-testable; `main.ts` supplies the Obsidian-backed one in Task 12.

- [ ] **Step 1: Write the failing test**

`tests/index/taskIndex.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskIndex, type MetadataSource } from '../../src/index/taskIndex';

class FakeSource implements MetadataSource {
  files = new Map<string, { fm: Record<string, unknown>; content: string }>();
  pathsIn(folder: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(`${folder}/`));
  }
  frontmatterOf(path: string) {
    return this.files.get(path)?.fm ?? null;
  }
  async read(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`no such file: ${path}`);
    return f.content;
  }
  add(path: string, fm: Record<string, unknown>, content = '') {
    this.files.set(path, { fm, content });
  }
}

let source: FakeSource;
let index: TaskIndex;

beforeEach(() => {
  source = new FakeSource();
  source.add('Tasks/TASK-1 A.md', { id: 'TASK-1', title: 'A', status: 'To Do' });
  source.add('Tasks/TASK-2 B.md', { id: 'TASK-2', title: 'B', status: 'Done' });
  source.add('Notes/not-a-task.md', { title: 'Nope' });
  index = new TaskIndex(source, () => 'Tasks');
});

describe('TaskIndex', () => {
  it('indexes only files under the tasks folder', async () => {
    await index.rebuild();
    expect(index.all()).toHaveLength(2);
    expect(index.all().map((t) => t.id).sort()).toEqual(['TASK-1', 'TASK-2']);
  });

  it('does not read file bodies during rebuild', async () => {
    const spy = vi.spyOn(source, 'read');
    await index.rebuild();
    expect(spy).not.toHaveBeenCalled();
  });

  it('exposes ids for id allocation', async () => {
    await index.rebuild();
    expect(index.ids().sort()).toEqual(['TASK-1', 'TASK-2']);
  });

  it('gets one task by path', async () => {
    await index.rebuild();
    expect(index.get('Tasks/TASK-1 A.md')?.title).toBe('A');
  });

  it('indexes a file with no id, flagged with a parse error', async () => {
    source.add('Tasks/Loose.md', { title: 'Loose' });
    await index.rebuild();
    const loose = index.get('Tasks/Loose.md');
    expect(loose).toBeDefined();
    expect(loose?.parseErrors.length).toBeGreaterThan(0);
  });

  it('updates a single task without touching the others', async () => {
    await index.rebuild();
    source.add('Tasks/TASK-1 A.md', { id: 'TASK-1', title: 'A renamed', status: 'To Do' });
    await index.updateOne('Tasks/TASK-1 A.md');
    expect(index.get('Tasks/TASK-1 A.md')?.title).toBe('A renamed');
    expect(index.all()).toHaveLength(2);
  });

  it('removes a task', async () => {
    await index.rebuild();
    index.remove('Tasks/TASK-1 A.md');
    expect(index.get('Tasks/TASK-1 A.md')).toBeUndefined();
    expect(index.all()).toHaveLength(1);
  });

  it('ignores updateOne for a path outside the tasks folder', async () => {
    await index.rebuild();
    await index.updateOne('Notes/not-a-task.md');
    expect(index.all()).toHaveLength(2);
  });

  it('notifies subscribers on change and stops after unsubscribe', async () => {
    const cb = vi.fn();
    const off = index.onChange(cb);
    await index.rebuild();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    await index.rebuild();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('reports duplicate ids', async () => {
    source.add('Tasks/TASK-1 copy.md', { id: 'TASK-1', title: 'A copy' });
    await index.rebuild();
    expect([...index.duplicateIds()]).toEqual(['TASK-1']);
    expect(index.all()).toHaveLength(3);
  });

  it('reports no duplicates when every id is distinct', async () => {
    await index.rebuild();
    expect(index.duplicateIds().size).toBe(0);
  });

  it('loads the body on demand', async () => {
    source.add('Tasks/TASK-3 C.md', { id: 'TASK-3', title: 'C' },
      '---\nid: TASK-3\n---\n\n## Description\n\nFull body.\n');
    await index.rebuild();
    const loaded = await index.loadBody('Tasks/TASK-3 C.md');
    expect(loaded?.description).toBe('Full body.');
    expect(index.get('Tasks/TASK-3 C.md')?.description).toBe('Full body.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/index/taskIndex.ts`**

```ts
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
```

- [ ] **Step 4: Create `src/write/obsidianVault.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/index`
Expected: all PASS.

Note `src/write/obsidianVault.ts` imports `obsidian` and is therefore not unit
tested; it is exercised manually in Task 13.

- [ ] **Step 6: Commit**

```bash
git add src/index src/write/obsidianVault.ts tests/index
git commit -m "feat: add metadataCache-backed task index"
```

---

### Task 10: View shell, store, and list pane

**Files:**
- Create: `src/ui/store.ts`
- Create: `src/ui/TaskTrackerView.tsx`
- Create: `src/ui/App.tsx`
- Create: `src/ui/TaskList.tsx`
- Create: `src/ui/dates.ts`
- Test: `tests/ui/dates.test.ts`, `tests/ui/store.test.ts`
- Modify: `src/main.ts`, `styles.css`

**Interfaces:**
- Consumes: `TaskIndex` (Task 9), `applyQuery`/`EMPTY_QUERY` (Task 6), `TaskWriter` (Task 8), settings (Task 7).
- Produces:
  - `const VIEW_TYPE_TASK_TRACKER = 'task-tracker-view'`
  - `class TaskTrackerView extends ItemView` — mounts Preact.
  - `interface StoreState { query: Query; selectedPath: string | null }`
  - `class Store` with `getState()`, `setQuery(patch: Partial<Query>)`, `select(path: string | null)`, `subscribe(cb)`.
  - `function dueBadge(due: string | null, today: Date): { text: string; tone: 'overdue' | 'soon' | 'normal' } | null`

- [ ] **Step 1: Write the failing tests**

`tests/ui/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dueBadge } from '../../src/ui/dates';

const today = new Date(2026, 8, 21);

describe('dueBadge', () => {
  it('returns null when there is no due date', () => {
    expect(dueBadge(null, today)).toBeNull();
  });

  it('returns null for a malformed due date', () => {
    expect(dueBadge('not-a-date', today)).toBeNull();
  });

  it('reports today', () => {
    expect(dueBadge('2026-09-21', today)).toEqual({ text: 'Due today', tone: 'soon' });
  });

  it('reports tomorrow in the singular', () => {
    expect(dueBadge('2026-09-22', today)).toEqual({ text: 'Due in 1 day', tone: 'soon' });
  });

  it('reports a comfortable future date as normal', () => {
    expect(dueBadge('2026-09-28', today)).toEqual({ text: 'Due in 7 days', tone: 'normal' });
  });

  it('reports overdue dates', () => {
    expect(dueBadge('2026-09-19', today)).toEqual({ text: 'Overdue by 2 days', tone: 'overdue' });
  });

  it('uses the singular for one day overdue', () => {
    expect(dueBadge('2026-09-20', today)).toEqual({ text: 'Overdue by 1 day', tone: 'overdue' });
  });
});
```

`tests/ui/store.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/ui/store';
import { EMPTY_QUERY } from '../../src/query/apply';

describe('Store', () => {
  it('starts with an empty query and no selection', () => {
    const s = new Store();
    expect(s.getState().query).toEqual(EMPTY_QUERY);
    expect(s.getState().selectedPath).toBeNull();
  });

  it('patches the query without dropping other keys', () => {
    const s = new Store();
    s.setQuery({ search: 'login' });
    s.setQuery({ hideDone: true });
    expect(s.getState().query.search).toBe('login');
    expect(s.getState().query.hideDone).toBe(true);
  });

  it('notifies subscribers on change', () => {
    const s = new Store();
    const cb = vi.fn();
    s.subscribe(cb);
    s.setQuery({ search: 'x' });
    s.select('Tasks/TASK-1 A.md');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const s = new Store();
    const cb = vi.fn();
    s.subscribe(cb)();
    s.setQuery({ search: 'x' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('toggles a filter value on and off', () => {
    const s = new Store();
    s.toggleFilter('status', 'Done');
    expect(s.getState().query.filters.status).toEqual(['Done']);
    s.toggleFilter('status', 'Done');
    expect(s.getState().query.filters.status).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/ui/dates.ts`**

```ts
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface Badge {
  text: string;
  tone: 'overdue' | 'soon' | 'normal';
}

function midnight(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dueBadge(due: string | null, today: Date): Badge | null {
  if (!due || !DATE_RE.test(due)) return null;
  const [y, m, d] = due.split('-').map(Number);
  const dueMs = Date.UTC(y, m - 1, d);
  const days = Math.round((dueMs - midnight(today)) / 86_400_000);

  if (days < 0) {
    const n = Math.abs(days);
    return { text: `Overdue by ${n} ${n === 1 ? 'day' : 'days'}`, tone: 'overdue' };
  }
  if (days === 0) return { text: 'Due today', tone: 'soon' };
  const text = `Due in ${days} ${days === 1 ? 'day' : 'days'}`;
  return { text, tone: days <= 2 ? 'soon' : 'normal' };
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
```

- [ ] **Step 4: Create `src/ui/store.ts`**

```ts
import { EMPTY_QUERY } from '../query/apply';
import type { Query } from '../query/types';

export interface StoreState {
  query: Query;
  selectedPath: string | null;
}

export class Store {
  private state: StoreState = { query: { ...EMPTY_QUERY }, selectedPath: null };
  private listeners = new Set<() => void>();

  getState(): StoreState {
    return this.state;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private set(next: StoreState): void {
    this.state = next;
    for (const cb of this.listeners) cb();
  }

  setQuery(patch: Partial<Query>): void {
    this.set({ ...this.state, query: { ...this.state.query, ...patch } });
  }

  toggleFilter(key: string, value: string): void {
    const current = this.state.query.filters[key] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    this.setQuery({ filters: { ...this.state.query.filters, [key]: next } });
  }

  select(path: string | null): void {
    this.set({ ...this.state, selectedPath: path });
  }
}
```

- [ ] **Step 5: Run the pure UI tests**

Run: `npx vitest run tests/ui`
Expected: all PASS.

- [ ] **Step 6: Create `src/ui/TaskList.tsx`**

```tsx
import type { Group } from '../query/types';
import type { Task } from '../model/types';
import type { FieldDef } from '../schema/types';
import { dueBadge } from './dates';

interface Props {
  groups: Group[];
  schema: FieldDef[];
  dueFieldKey: string | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function badgeValues(task: Task, schema: FieldDef[]): { key: string; text: string }[] {
  return schema
    .filter((f) => f.showInList)
    .map((f) => {
      const raw = task.fields[f.key];
      if (raw === null || raw === undefined || raw === '') return null;
      const text = Array.isArray(raw) ? raw.join(', ') : String(raw);
      return { key: f.key, text };
    })
    .filter((b): b is { key: string; text: string } => b !== null);
}

export function TaskList({ groups, schema, dueFieldKey, selectedPath, onSelect }: Props) {
  const today = new Date();
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);

  if (total === 0) {
    return <div class="tt-empty">No tasks match this filter.</div>;
  }

  return (
    <div class="tt-list">
      {groups.map((group) => (
        <div class="tt-group" key={group.key}>
          {group.key !== '' && (
            <div class="tt-group-header">
              {group.key} <span class="tt-count">{group.tasks.length}</span>
            </div>
          )}
          {group.tasks.map((task) => {
            const due = dueFieldKey ? (task.fields[dueFieldKey] as string | undefined) : null;
            const badge = dueBadge(due ?? null, today);
            return (
              <div
                key={task.path}
                class={`tt-row${task.path === selectedPath ? ' is-selected' : ''}`}
                onClick={() => onSelect(task.path)}
              >
                <div class="tt-row-top">
                  <span class="tt-id">{task.id ?? '—'}</span>
                  <span class="tt-title">{task.title}</span>
                  {task.parseErrors.length > 0 && (
                    <span class="tt-warn" title={task.parseErrors.join('\n')}>⚠</span>
                  )}
                </div>
                <div class="tt-row-badges">
                  {badgeValues(task, schema).map((b) => (
                    <span class="tt-badge" key={b.key}>{b.text}</span>
                  ))}
                  {badge && <span class={`tt-badge tt-due-${badge.tone}`}>{badge.text}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create `src/ui/App.tsx` (list pane only for now)**

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { TaskIndex } from '../index/taskIndex';
import type { TaskWriter } from '../write/writer';
import type { TaskTrackerSettings } from '../settings/types';
import { applyQuery } from '../query/apply';
import { sortedSchema } from '../schema/validate';
import { Store } from './store';
import { TaskList } from './TaskList';

export interface AppProps {
  index: TaskIndex;
  writer: TaskWriter;
  store: Store;
  settings: () => TaskTrackerSettings;
  openAsNote: (path: string) => void;
}

/** Re-render whenever the index or the store changes. */
function useRevision(index: TaskIndex, store: Store): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    const offIndex = index.onChange(bump);
    const offStore = store.subscribe(bump);
    return () => { offIndex(); offStore(); };
  }, [index, store]);
  return rev;
}

export function App({ index, store, settings }: AppProps) {
  useRevision(index, store);
  const s = settings();
  const { query, selectedPath } = store.getState();
  const schema = sortedSchema(s.schema);

  const groups = applyQuery(index.all(), query, schema, s.doneStatuses, s.statusFieldKey);

  return (
    <div class="tt-root">
      <div class="tt-sidebar">
        <TaskList
          groups={groups}
          schema={schema}
          dueFieldKey={s.dueFieldKey}
          selectedPath={selectedPath}
          onSelect={(p) => { store.select(p); void index.loadBody(p); }}
        />
      </div>
      <div class="tt-detail">
        {selectedPath === null
          ? <div class="tt-empty">Select a task.</div>
          : <div class="tt-empty">Detail pane arrives in Task 11.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create `src/ui/TaskTrackerView.tsx`**

```tsx
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { render } from 'preact';
import type { TaskIndex } from '../index/taskIndex';
import type { TaskWriter } from '../write/writer';
import type { TaskTrackerSettings } from '../settings/types';
import { App } from './App';
import { Store } from './store';

export const VIEW_TYPE_TASK_TRACKER = 'task-tracker-view';

export class TaskTrackerView extends ItemView {
  private store = new Store();

  constructor(
    leaf: WorkspaceLeaf,
    private index: TaskIndex,
    private writer: TaskWriter,
    private settings: () => TaskTrackerSettings,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TASK_TRACKER;
  }

  getDisplayText(): string {
    return 'Task Tracker';
  }

  getIcon(): string {
    return 'check-square';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('task-tracker-view');
    render(
      <App
        index={this.index}
        writer={this.writer}
        store={this.store}
        settings={this.settings}
        openAsNote={(path) => { void this.app.workspace.openLinkText(path, '', true); }}
      />,
      this.contentEl,
    );
  }

  async onClose(): Promise<void> {
    render(null, this.contentEl);
  }
}
```

- [ ] **Step 9: Wire the view into `src/main.ts`**

```ts
import { Plugin, TFile, type WorkspaceLeaf } from 'obsidian';
import { TaskIndex, type MetadataSource } from './index/taskIndex';
import { DEFAULT_SETTINGS, mergeSettings } from './settings/defaults';
import type { TaskTrackerSettings } from './settings/types';
import { ObsidianVaultAdapter } from './write/obsidianVault';
import { TaskWriter } from './write/writer';
import { TaskTrackerView, VIEW_TYPE_TASK_TRACKER } from './ui/TaskTrackerView';

export default class TaskTrackerPlugin extends Plugin {
  settings: TaskTrackerSettings = DEFAULT_SETTINGS;
  index!: TaskIndex;
  writer!: TaskWriter;

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());

    const source: MetadataSource = {
      pathsIn: (folder) =>
        this.app.vault.getMarkdownFiles()
          .filter((f) => f.parent?.path === folder)
          .map((f) => f.path),
      frontmatterOf: (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        return (this.app.metadataCache.getFileCache(file)?.frontmatter ?? null) as
          Record<string, unknown> | null;
      },
      read: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`No such file: ${path}`);
        return this.app.vault.read(file);
      },
    };

    this.index = new TaskIndex(source, () => this.settings.tasksFolder);
    this.writer = new TaskWriter(new ObsidianVaultAdapter(this.app), () => this.settings);

    this.registerView(
      VIEW_TYPE_TASK_TRACKER,
      (leaf: WorkspaceLeaf) =>
        new TaskTrackerView(leaf, this.index, this.writer, () => this.settings),
    );

    this.addRibbonIcon('check-square', 'Open Task Tracker', () => { void this.activateView(); });
    this.addCommand({
      id: 'open-task-tracker',
      name: 'Open Task Tracker',
      callback: () => { void this.activateView(); },
    });

    this.app.workspace.onLayoutReady(() => { void this.index.rebuild(); });

    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      void this.index.updateOne(file.path);
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      this.index.remove(file.path);
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.index.remove(oldPath);
      void this.index.updateOne(file.path);
    }));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await this.index.rebuild();
  }

  /** Focus an existing Task Tracker tab, or open one. */
  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_TRACKER);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_TASK_TRACKER, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
```

- [ ] **Step 10: Add layout styles to `styles.css`**

```css
.task-tracker-view .tt-root {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.tt-sidebar {
  width: 320px;
  min-width: 240px;
  border-right: 1px solid var(--background-modifier-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tt-list { overflow-y: auto; flex: 1; }
.tt-detail { flex: 1; overflow-y: auto; padding: 16px 24px; }

.tt-group-header {
  padding: 8px 12px 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.tt-count { opacity: 0.6; }

.tt-row {
  padding: 8px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  cursor: pointer;
}
.tt-row:hover { background: var(--background-modifier-hover); }
.tt-row.is-selected { background: var(--background-modifier-active-hover); }

.tt-row-top { display: flex; gap: 8px; align-items: baseline; }
.tt-id { color: var(--text-muted); font-size: 11px; font-family: var(--font-monospace); }
.tt-title { flex: 1; }
.tt-warn { color: var(--text-warning); }

.tt-row-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.tt-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--background-modifier-border);
  color: var(--text-muted);
}
.tt-due-overdue { background: var(--background-modifier-error); color: var(--text-error); }
.tt-due-soon { background: var(--background-modifier-success); }

.tt-empty { padding: 24px 12px; color: var(--text-muted); text-align: center; }
```

- [ ] **Step 11: Verify the build and the suite**

Run: `npm run build`
Expected: writes `main.js` with no errors.

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 12: Commit**

```bash
git add src/ui src/main.ts styles.css tests/ui
git commit -m "feat: add task tracker view with grouped, filterable task list"
```

---

### Task 11: Filter bar and detail pane

**Files:**
- Create: `src/ui/FilterBar.tsx`
- Create: `src/ui/FieldWidget.tsx`
- Create: `src/ui/TaskDetail.tsx`
- Modify: `src/ui/App.tsx`, `styles.css`

**Interfaces:**
- Consumes: `Store` (Task 10), `TaskWriter` (Task 8), `coerceValue` (Task 2), `dueBadge` (Task 10).
- Produces: `FilterBar`, `TaskDetail`, `FieldWidget` components. No new pure functions, so no new unit tests; verification is the build plus the manual pass in Task 13.

- [ ] **Step 1: Create `src/ui/FilterBar.tsx`**

```tsx
import type { FieldDef } from '../schema/types';
import type { Query } from '../query/types';

interface Props {
  query: Query;
  schema: FieldDef[];
  onQuery: (patch: Partial<Query>) => void;
  onToggleFilter: (key: string, value: string) => void;
  onCreate: () => void;
}

/** Fields whose values form a closed set are the ones worth offering as chips. */
function filterableFields(schema: FieldDef[]): FieldDef[] {
  return schema.filter((f) => f.type === 'select' || f.type === 'multiselect');
}

export function FilterBar({ query, schema, onQuery, onToggleFilter, onCreate }: Props) {
  const sortOptions = [
    { key: 'updated', label: 'Updated' },
    { key: 'created', label: 'Created' },
    { key: 'title', label: 'Title' },
    { key: 'id', label: 'ID' },
    ...schema.filter((f) => f.type === 'date' || f.type === 'number')
      .map((f) => ({ key: f.key, label: f.label })),
  ];

  return (
    <div class="tt-filterbar">
      <div class="tt-filter-row">
        <input
          class="tt-search"
          type="search"
          placeholder="Search tasks…"
          value={query.search}
          onInput={(e) => onQuery({ search: (e.target as HTMLInputElement).value })}
        />
        <button class="mod-cta tt-create" onClick={onCreate}>Create issue</button>
      </div>

      <div class="tt-filter-row">
        <select
          value={query.sortKey}
          onChange={(e) => onQuery({ sortKey: (e.target as HTMLSelectElement).value })}
        >
          {sortOptions.map((o) => <option value={o.key} key={o.key}>Sort: {o.label}</option>)}
        </select>

        <button
          class="tt-icon-btn"
          title="Toggle sort direction"
          onClick={() => onQuery({ sortDir: query.sortDir === 'asc' ? 'desc' : 'asc' })}
        >
          {query.sortDir === 'asc' ? '↑' : '↓'}
        </button>

        <select
          value={query.groupBy ?? ''}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            onQuery({ groupBy: v === '' ? null : v });
          }}
        >
          <option value="">No grouping</option>
          {filterableFields(schema).map((f) => (
            <option value={f.key} key={f.key}>Group: {f.label}</option>
          ))}
        </select>

        <label class="tt-toggle">
          <input
            type="checkbox"
            checked={query.hideDone}
            onChange={(e) => onQuery({ hideDone: (e.target as HTMLInputElement).checked })}
          />
          Hide done
        </label>
      </div>

      {filterableFields(schema).map((f) => (
        <div class="tt-chips" key={f.key}>
          <span class="tt-chips-label">{f.label}</span>
          {(f.options ?? []).map((opt) => {
            const active = (query.filters[f.key] ?? []).includes(opt);
            return (
              <button
                key={opt}
                class={`tt-chip${active ? ' is-active' : ''}`}
                onClick={() => onToggleFilter(f.key, opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/ui/FieldWidget.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { FieldDef } from '../schema/types';
import { coerceValue } from '../schema/coerce';

interface Props {
  def: FieldDef;
  value: unknown;
  onCommit: (value: unknown) => void;
}

/** One input per field type. Text-ish inputs commit on blur; the rest commit immediately. */
export function FieldWidget({ def, value, onCommit }: Props) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));

  useEffect(() => {
    setDraft(value === null || value === undefined ? '' : String(value));
  }, [value, def.key]);

  const result = coerceValue(def, value);
  const invalid = !result.ok;

  switch (def.type) {
    case 'select': {
      const current = typeof value === 'string' ? value : '';
      const options = def.options ?? [];
      // A value outside the options list survives an options edit: show it,
      // marked, rather than silently rendering as "no value".
      const orphaned = current !== '' && !options.includes(current);
      return (
        <select
          class={orphaned ? 'tt-invalid' : ''}
          value={current}
          onChange={(e) => onCommit((e.target as HTMLSelectElement).value || null)}
        >
          <option value="">—</option>
          {orphaned && <option value={current}>{current} (not an option)</option>}
          {options.map((o) => <option value={o} key={o}>{o}</option>)}
        </select>
      );
    }

    case 'multiselect': {
      const selected = Array.isArray(value) ? value.map(String) : [];
      const options = def.options ?? [];
      if (options.length === 0) {
        // Free-form tags: comma-separated text.
        return (
          <input
            type="text"
            value={selected.join(', ')}
            placeholder="comma, separated"
            onBlur={(e) => {
              const parts = (e.target as HTMLInputElement).value
                .split(',').map((s) => s.trim()).filter((s) => s.length > 0);
              onCommit(parts);
            }}
          />
        );
      }
      return (
        <div class="tt-multiselect">
          {options.map((o) => (
            <label key={o}>
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => {
                  const on = (e.target as HTMLInputElement).checked;
                  onCommit(on ? [...selected, o] : selected.filter((v) => v !== o));
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }

    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onCommit((e.target as HTMLInputElement).checked)}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onCommit((e.target as HTMLInputElement).value || null)}
        />
      );

    case 'number':
      return (
        <input
          class={invalid ? 'tt-invalid' : ''}
          type="number"
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onBlur={() => onCommit(draft === '' ? null : Number(draft))}
        />
      );

    default:
      return (
        <input
          class={invalid ? 'tt-invalid' : ''}
          type="text"
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onBlur={() => onCommit(draft === '' ? null : draft)}
        />
      );
  }
}
```

- [ ] **Step 3: Create `src/ui/TaskDetail.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { Task } from '../model/types';
import type { FieldDef } from '../schema/types';
import { FieldWidget } from './FieldWidget';
import { dueBadge } from './dates';

interface Props {
  task: Task;
  schema: FieldDef[];
  dueFieldKey: string | null;
  /** True when another file claims the same id. */
  duplicateId: boolean;
  onAssignId: () => void;
  onSetField: (key: string, value: unknown) => void;
  onSetTitle: (title: string) => void;
  onSetDescription: (description: string) => void;
  onAddComment: (body: string) => void;
  onEditComment: (id: string, body: string) => void;
  onDeleteComment: (id: string) => void;
  onOpenAsNote: () => void;
}

export function TaskDetail(props: Props) {
  const { task, schema, dueFieldKey } = props;
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setNewComment('');
    setEditingId(null);
  }, [task.path, task.updated]);

  const badge = dueBadge(
    dueFieldKey ? ((task.fields[dueFieldKey] as string | undefined) ?? null) : null,
    new Date(),
  );

  return (
    <div class="tt-detail-inner">
      {task.parseErrors.length > 0 && (
        <div class="tt-errors">
          {task.parseErrors.map((e) => <div key={e}>⚠ {e}</div>)}
          {task.id === null && (
            <button onClick={props.onAssignId}>Assign an ID</button>
          )}
        </div>
      )}

      {props.duplicateId && (
        <div class="tt-errors">
          ⚠ Another task already uses the ID {task.id}. Edit one of them by hand.
        </div>
      )}

      <div class="tt-detail-head">
        <span class="tt-id">{task.id ?? 'no id'}</span>
        {badge && <span class={`tt-badge tt-due-${badge.tone}`}>{badge.text}</span>}
        <button class="tt-icon-btn" onClick={props.onOpenAsNote}>Open as note</button>
      </div>

      <input
        class="tt-title-input"
        value={title}
        onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
        onBlur={() => { if (title.trim() && title !== task.title) props.onSetTitle(title.trim()); }}
      />

      <div class="tt-fields">
        {schema.map((def) => (
          <div class="tt-field" key={def.key}>
            <label class="tt-field-label">{def.label}</label>
            <div class="tt-field-input">
              <FieldWidget
                def={def}
                value={task.fields[def.key] ?? null}
                onCommit={(v) => props.onSetField(def.key, v)}
              />
            </div>
          </div>
        ))}
      </div>

      <h3>Description</h3>
      <textarea
        class="tt-description"
        rows={8}
        value={description}
        onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
        onBlur={() => { if (description !== task.description) props.onSetDescription(description); }}
      />

      <h3>Comments</h3>
      <div class="tt-comments">
        {task.comments.map((c) => (
          <div class="tt-comment" key={c.id}>
            <div class="tt-comment-head">
              <strong>{c.author}</strong>
              <span class="tt-comment-time">{c.timestamp.replace('T', ' ')}</span>
              <button class="tt-icon-btn" onClick={() => { setEditingId(c.id); setEditingBody(c.body); }}>
                Edit
              </button>
              <button class="tt-icon-btn" onClick={() => props.onDeleteComment(c.id)}>Delete</button>
            </div>
            {editingId === c.id ? (
              <div>
                <textarea
                  rows={3}
                  value={editingBody}
                  onInput={(e) => setEditingBody((e.target as HTMLTextAreaElement).value)}
                />
                <button onClick={() => { props.onEditComment(c.id, editingBody); setEditingId(null); }}>
                  Save
                </button>
                <button onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            ) : (
              <div class="tt-comment-body">{c.body}</div>
            )}
          </div>
        ))}
      </div>

      <textarea
        class="tt-new-comment"
        rows={3}
        placeholder="Add a comment…"
        value={newComment}
        onInput={(e) => setNewComment((e.target as HTMLTextAreaElement).value)}
      />
      <button
        class="mod-cta"
        disabled={newComment.trim().length === 0}
        onClick={() => { props.onAddComment(newComment.trim()); setNewComment(''); }}
      >
        Comment
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire both into `src/ui/App.tsx`**

Replace the whole file:

```tsx
import { useEffect, useState } from 'preact/hooks';
import { Notice } from 'obsidian';
import type { TaskIndex } from '../index/taskIndex';
import type { TaskWriter } from '../write/writer';
import type { TaskTrackerSettings } from '../settings/types';
import { applyQuery } from '../query/apply';
import { sortedSchema } from '../schema/validate';
import { Store } from './store';
import { TaskList } from './TaskList';
import { FilterBar } from './FilterBar';
import { TaskDetail } from './TaskDetail';

export interface AppProps {
  index: TaskIndex;
  writer: TaskWriter;
  store: Store;
  settings: () => TaskTrackerSettings;
  openAsNote: (path: string) => void;
  onCreate: () => void;
}

function useRevision(index: TaskIndex, store: Store): void {
  const [, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    const offIndex = index.onChange(bump);
    const offStore = store.subscribe(bump);
    return () => { offIndex(); offStore(); };
  }, [index, store]);
}

export function App({ index, writer, store, settings, openAsNote, onCreate }: AppProps) {
  useRevision(index, store);
  const s = settings();
  const { query, selectedPath } = store.getState();
  const schema = sortedSchema(s.schema);
  const groups = applyQuery(index.all(), query, schema, s.doneStatuses, s.statusFieldKey);
  const selected = selectedPath === null ? undefined : index.get(selectedPath);

  /** Every write goes through here so a failure surfaces once, consistently. */
  const guard = (op: () => Promise<unknown>) => {
    void op().catch((e: unknown) => {
      new Notice(`Task Tracker: ${e instanceof Error ? e.message : String(e)}`);
      void index.rebuild();
    });
  };

  return (
    <div class="tt-root">
      <div class="tt-sidebar">
        <FilterBar
          query={query}
          schema={schema}
          onQuery={(patch) => store.setQuery(patch)}
          onToggleFilter={(k, v) => store.toggleFilter(k, v)}
          onCreate={onCreate}
        />
        <TaskList
          groups={groups}
          schema={schema}
          dueFieldKey={s.dueFieldKey}
          selectedPath={selectedPath}
          onSelect={(p) => { store.select(p); void index.loadBody(p); }}
        />
      </div>

      <div class="tt-detail">
        {selected === undefined ? (
          <div class="tt-empty">Select a task.</div>
        ) : (
          <TaskDetail
            task={selected}
            schema={schema}
            dueFieldKey={s.dueFieldKey}
            duplicateId={selected.id !== null && index.duplicateIds().has(selected.id)}
            onAssignId={() => guard(async () => {
              await writer.setField(selected.path, 'id', writer.nextId(index.ids()));
              await index.loadBody(selected.path);
            })}
            onSetField={(k, v) => guard(async () => {
              await writer.setField(selected.path, k, v);
              await index.loadBody(selected.path);
            })}
            onSetTitle={(t) => guard(async () => {
              const next = await writer.setTitle(selected.path, t);
              store.select(next);
              await index.loadBody(next);
            })}
            onSetDescription={(d) => guard(async () => {
              await writer.setDescriptionAt(selected.path, d);
              await index.loadBody(selected.path);
            })}
            onAddComment={(b) => guard(async () => {
              await writer.addCommentAt(selected.path, b);
              await index.loadBody(selected.path);
            })}
            onEditComment={(id, b) => guard(async () => {
              await writer.editCommentAt(selected.path, id, b);
              await index.loadBody(selected.path);
            })}
            onDeleteComment={(id) => guard(async () => {
              await writer.deleteCommentAt(selected.path, id);
              await index.loadBody(selected.path);
            })}
            onOpenAsNote={() => openAsNote(selected.path)}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Pass `onCreate` from the view**

In `src/ui/TaskTrackerView.tsx`, add a constructor parameter and prop:

```tsx
  constructor(
    leaf: WorkspaceLeaf,
    private index: TaskIndex,
    private writer: TaskWriter,
    private settings: () => TaskTrackerSettings,
    private onCreate: () => void,
  ) {
    super(leaf);
  }
```

and in `onOpen`'s `render` call add `onCreate={this.onCreate}`.

In `src/main.ts`, update the `registerView` factory:

```ts
    this.registerView(
      VIEW_TYPE_TASK_TRACKER,
      (leaf: WorkspaceLeaf) =>
        new TaskTrackerView(leaf, this.index, this.writer, () => this.settings, () => {
          // Replaced by the create modal in Task 12.
          new Notice('Create issue arrives in Task 12.');
        }),
    );
```

and add `Notice` to the `obsidian` import.

- [ ] **Step 6: Append detail and filter styles to `styles.css`**

```css
.tt-filterbar {
  padding: 8px;
  border-bottom: 1px solid var(--background-modifier-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tt-filter-row { display: flex; gap: 6px; align-items: center; }
.tt-search { flex: 1; min-width: 0; }
.tt-create { white-space: nowrap; }
.tt-toggle { display: flex; align-items: center; gap: 4px; font-size: 12px; }

.tt-chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.tt-chips-label { font-size: 11px; color: var(--text-muted); margin-right: 4px; }
.tt-chip {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--background-modifier-border);
  border: none;
  cursor: pointer;
}
.tt-chip.is-active { background: var(--interactive-accent); color: var(--text-on-accent); }

.tt-detail-inner { max-width: 760px; }
.tt-detail-head { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.tt-title-input {
  width: 100%;
  font-size: 20px;
  font-weight: 600;
  border: 1px solid transparent;
  background: transparent;
  padding: 4px;
}
.tt-title-input:hover { border-color: var(--background-modifier-border); }

.tt-fields { display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; margin: 16px 0; }
.tt-field { display: contents; }
.tt-field-label { color: var(--text-muted); font-size: 13px; align-self: center; }
.tt-multiselect { display: flex; flex-wrap: wrap; gap: 8px; }

.tt-description, .tt-new-comment { width: 100%; }
.tt-invalid { border-color: var(--text-error); }
.tt-errors { color: var(--text-error); margin-bottom: 8px; }

.tt-comment { border-top: 1px solid var(--background-modifier-border); padding: 8px 0; }
.tt-comment-head { display: flex; gap: 8px; align-items: baseline; font-size: 12px; }
.tt-comment-time { color: var(--text-muted); flex: 1; }
.tt-comment-body { white-space: pre-wrap; margin-top: 4px; }
.tt-icon-btn { background: transparent; border: none; cursor: pointer; color: var(--text-muted); }
.tt-icon-btn:hover { color: var(--text-normal); }

@media (max-width: 700px) {
  .task-tracker-view .tt-root { flex-direction: column; }
  .tt-sidebar { width: auto; border-right: none; border-bottom: 1px solid var(--background-modifier-border); }
}
```

- [ ] **Step 7: Verify build and suite**

Run: `npm run build && npm test && npm run typecheck`
Expected: build succeeds, all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/main.ts styles.css
git commit -m "feat: add filter bar and task detail pane"
```

---

### Task 12: Create-task modal and settings tab

**Files:**
- Create: `src/ui/CreateTaskModal.ts`
- Create: `src/settings/SettingsTab.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `TaskWriter` (Task 8), `TaskIndex` (Task 9), schema mutation helpers (Task 3), `validateFieldDef` (Task 3).
- Produces:
  - `class CreateTaskModal extends Modal` — `constructor(app, settings, onSubmit: (title: string, fields: Record<string, unknown>) => void)`
  - `class TaskTrackerSettingTab extends PluginSettingTab`

- [ ] **Step 1: Create `src/ui/CreateTaskModal.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/settings/SettingsTab.ts`**

```ts
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type TaskTrackerPlugin from '../main';
import type { FieldDef, FieldType } from '../schema/types';
import {
  addField, removeField, reorderField, sortedSchema, updateField, validateFieldDef,
} from '../schema/validate';

const TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'person'];

export class TaskTrackerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TaskTrackerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    const save = async () => {
      await this.plugin.saveSettings();
      this.display();
    };

    new Setting(containerEl).setName('General').setHeading();

    new Setting(containerEl)
      .setName('Tasks folder')
      .setDesc('Flat folder holding task files.')
      .addText((t) => t.setValue(s.tasksFolder).onChange(async (v) => {
        s.tasksFolder = v.trim() || 'Tasks';
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('ID prefix')
      .setDesc('Task IDs are <prefix>-<number>.')
      .addText((t) => t.setValue(s.idPrefix).onChange(async (v) => {
        s.idPrefix = v.trim().toUpperCase() || 'TASK';
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Your name')
      .setDesc('Author stamped on comments.')
      .addText((t) => t.setValue(s.authorName).onChange(async (v) => {
        s.authorName = v.trim() || 'Me';
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl).setName('Status and dates').setHeading();

    new Setting(containerEl)
      .setName('Status field')
      .addDropdown((d) => {
        for (const f of s.schema.filter((f) => f.type === 'select')) d.addOption(f.key, f.label);
        d.setValue(s.statusFieldKey).onChange(async (v) => {
          s.statusFieldKey = v;
          await save();
        });
      });

    const statusField = s.schema.find((f) => f.key === s.statusFieldKey);
    for (const opt of statusField?.options ?? []) {
      new Setting(containerEl)
        .setName(`"${opt}" counts as done`)
        .addToggle((t) => t.setValue(s.doneStatuses.includes(opt)).onChange(async (on) => {
          s.doneStatuses = on
            ? [...new Set([...s.doneStatuses, opt])]
            : s.doneStatuses.filter((x) => x !== opt);
          await this.plugin.saveSettings();
        }));
    }

    new Setting(containerEl)
      .setName('Due date field')
      .setDesc('Drives the due / overdue badge.')
      .addDropdown((d) => {
        d.addOption('', 'None');
        for (const f of s.schema.filter((f) => f.type === 'date')) d.addOption(f.key, f.label);
        d.setValue(s.dueFieldKey ?? '').onChange(async (v) => {
          s.dueFieldKey = v === '' ? null : v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl).setName('Fields').setHeading();

    const sorted = sortedSchema(s.schema);
    sorted.forEach((f, i) => {
      new Setting(containerEl)
        .setName(`${f.label} (${f.type})`)
        .setDesc(`Key: ${f.key}${f.options?.length ? ` · ${f.options.join(', ')}` : ''}`)
        .addText((t) => t.setPlaceholder('Label').setValue(f.label).onChange(async (v) => {
          if (v.trim().length === 0) return;
          s.schema = updateField(s.schema, f.key, { label: v.trim() });
          await this.plugin.saveSettings();
        }))
        .addText((t) => t.setPlaceholder('Options, comma separated')
          .setValue((f.options ?? []).join(', '))
          .setDisabled(f.type !== 'select' && f.type !== 'multiselect')
          .onChange(async (v) => {
            const options = v.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
            s.schema = updateField(s.schema, f.key, { options });
            await this.plugin.saveSettings();
          }))
        .addToggle((t) => t.setTooltip('Show on list rows')
          .setValue(f.showInList === true)
          .onChange(async (on) => {
            s.schema = updateField(s.schema, f.key, { showInList: on });
            await this.plugin.saveSettings();
          }))
        .addButton((b) => b.setIcon('arrow-up').setDisabled(i === 0).onClick(async () => {
          s.schema = reorderField(s.schema, f.key, i - 1);
          await save();
        }))
        .addButton((b) => b.setIcon('arrow-down').setDisabled(i === sorted.length - 1)
          .onClick(async () => {
            s.schema = reorderField(s.schema, f.key, i + 1);
            await save();
          }))
        .addButton((b) => b.setIcon('trash').setWarning().onClick(async () => {
          if (f.key === s.statusFieldKey) {
            new Notice('Pick a different status field before deleting this one.');
            return;
          }
          s.schema = removeField(s.schema, f.key);
          if (s.dueFieldKey === f.key) s.dueFieldKey = null;
          await save();
        }));
    });

    new Setting(containerEl).setName('Add a field').setHeading();

    let newKey = '';
    let newLabel = '';
    let newType: FieldType = 'text';
    let newOptions = '';

    new Setting(containerEl)
      .setName('New field')
      .setDesc('Key becomes the frontmatter key and cannot be changed later.')
      .addText((t) => t.setPlaceholder('key').onChange((v) => { newKey = v.trim(); }))
      .addText((t) => t.setPlaceholder('Label').onChange((v) => { newLabel = v.trim(); }))
      .addDropdown((d) => {
        for (const t of TYPES) d.addOption(t, t);
        d.setValue('text').onChange((v) => { newType = v as FieldType; });
      })
      .addText((t) => t.setPlaceholder('options, comma separated')
        .onChange((v) => { newOptions = v; }))
      .addButton((b) => b.setButtonText('Add').setCta().onClick(async () => {
        const def: FieldDef = {
          key: newKey,
          label: newLabel || newKey,
          type: newType,
          options: newOptions.split(',').map((x) => x.trim()).filter((x) => x.length > 0),
          order: s.schema.length,
        };
        const errors = validateFieldDef(def, s.schema);
        if (errors.length > 0) {
          new Notice(errors.join('\n'));
          return;
        }
        s.schema = addField(s.schema, def);
        await save();
      }));

    new Setting(containerEl).setName('Maintenance').setHeading();

    new Setting(containerEl)
      .setName('Clean up orphaned frontmatter keys')
      .setDesc('Find frontmatter keys on tasks that no longer match any field, and remove them.')
      .addButton((b) => b.setButtonText('Scan').onClick(async () => {
        const known = new Set([
          'id', 'title', 'created', 'updated', ...s.schema.map((f) => f.key),
        ]);
        const orphans = new Map<string, string[]>();
        for (const task of this.plugin.index.all()) {
          for (const key of Object.keys(task.fields)) {
            if (known.has(key)) continue;
            orphans.set(key, [...(orphans.get(key) ?? []), task.path]);
          }
        }
        if (orphans.size === 0) {
          new Notice('No orphaned keys found.');
          return;
        }
        const summary = [...orphans.entries()]
          .map(([k, paths]) => `${k} (${paths.length})`).join(', ');
        const ok = window.confirm(
          `Remove these keys from every task?\n\n${summary}\n\nThis cannot be undone.`,
        );
        if (!ok) return;
        for (const [key, paths] of orphans) {
          for (const path of paths) {
            await this.plugin.writer.setField(path, key, null);
          }
        }
        await this.plugin.index.rebuild();
        new Notice(`Removed ${orphans.size} orphaned key(s).`);
      }));
  }
}
```

- [ ] **Step 3: Wire both into `src/main.ts`**

Add imports:

```ts
import { CreateTaskModal } from './ui/CreateTaskModal';
import { TaskTrackerSettingTab } from './settings/SettingsTab';
```

Replace the placeholder `onCreate` callback in `registerView` with
`() => this.openCreateModal()`, add the settings tab at the end of `onload`:

```ts
    this.addSettingTab(new TaskTrackerSettingTab(this.app, this));
```

and add the method:

```ts
  openCreateModal(): void {
    new CreateTaskModal(this.app, this.settings, (title, fields) => {
      void (async () => {
        try {
          const path = await this.writer.createTask(title, fields, this.index.ids());
          await this.index.updateOne(path);
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_TRACKER);
          for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof TaskTrackerView) view.selectTask(path);
          }
        } catch (e) {
          new Notice(`Task Tracker: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
    }).open();
  }
```

Add `selectTask` to `src/ui/TaskTrackerView.tsx`:

```tsx
  selectTask(path: string): void {
    this.store.select(path);
  }
```

Also add a command for creating a task, next to the existing command:

```ts
    this.addCommand({
      id: 'create-task',
      name: 'Create issue',
      callback: () => this.openCreateModal(),
    });
```

- [ ] **Step 4: Verify build and suite**

Run: `npm run build && npm test && npm run typecheck`
Expected: build succeeds, all tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/CreateTaskModal.ts src/settings/SettingsTab.ts src/main.ts src/ui/TaskTrackerView.tsx
git commit -m "feat: add create-issue modal and schema settings tab"
```

---

### Task 13: Manual verification in a real vault and README

**Files:**
- Create: `README.md`
- Create: `docs/manual-test.md`

**Interfaces:**
- Consumes: everything.
- Produces: a recorded manual pass and user-facing docs. No new code.

This task is the honest check on the layers unit tests cannot reach: the
Obsidian view, the vault adapter, and the metadataCache wiring.

- [ ] **Step 1: Point the build at a vault**

```bash
cp .env.example .env
# edit .env and set VAULT_PATH to a real (preferably scratch) vault
```

Run: `set -a && source .env && set +a && npm run build`
Expected: output ends with `copied plugin to <vault>/.obsidian/plugins/obsidian-task-tracker`.

If `VAULT_PATH` is unknown at this point, stop and ask the user for it rather
than guessing a path.

- [ ] **Step 2: Enable the plugin**

In Obsidian: Settings → Community plugins → enable "Task Tracker". Reload the
vault with `Cmd+R` after each rebuild.

- [ ] **Step 3: Walk the manual checklist**

Create `docs/manual-test.md` with this content, and tick each line as you
verify it in the app:

```markdown
# Manual test checklist

Run after any change to the view, the vault adapter, or the index wiring.

## Opening
- [ ] Ribbon icon opens the Task Tracker tab.
- [ ] "Open Task Tracker" command opens it.
- [ ] Running the command twice focuses the existing tab rather than opening a second.

## Creating
- [ ] "Create issue" opens the modal with the title focused.
- [ ] Submitting with an empty title shows a notice and does not create a file.
- [ ] Submitting creates `Tasks/TASK-1 <title>.md` with frontmatter, Description and Comments sections.
- [ ] The new task is selected in the detail pane.
- [ ] Creating a second task allocates TASK-2.
- [ ] Deleting TASK-2 in the file explorer and creating again allocates TASK-3, not TASK-2.

## Listing and filtering
- [ ] Typing in search narrows the list.
- [ ] Search matches a word that appears only in a task's description.
- [ ] Clicking a status chip filters; clicking again clears it.
- [ ] Two chips in the same field OR together.
- [ ] A status chip plus an assignee filter AND together.
- [ ] Sort by due date orders correctly, and the direction button reverses it.
- [ ] Tasks with no due date sort last in both directions.
- [ ] Group by status shows groups in schema option order.
- [ ] "Hide done" removes Done tasks.

## Detail pane
- [ ] Clicking a row shows its fields, description and comments.
- [ ] Changing a select writes to frontmatter immediately.
- [ ] Editing a text field writes on blur.
- [ ] Clearing a field removes the key from frontmatter.
- [ ] Editing the title renames the file and keeps the task selected.
- [ ] Editing the title to collide with an existing filename keeps the old filename and shows no data loss.
- [ ] Editing the description writes only the Description section.
- [ ] A hand-written `## Notes` section survives a description edit.
- [ ] `updated` changes on every edit.

## Comments
- [ ] Adding a comment appends it with the configured author name.
- [ ] A multi-line comment round-trips.
- [ ] Editing a comment changes only that comment.
- [ ] Deleting a comment leaves the others intact.

## Editing outside the plugin
- [ ] "Open as note" opens the raw markdown.
- [ ] Editing frontmatter in the note updates the list within a second.
- [ ] Adding a task file by hand makes it appear in the list.
- [ ] A file in `Tasks/` with no `id` appears with a warning rather than vanishing.
- [ ] "Assign an ID" on that file writes the next free ID and clears the warning.
- [ ] Two files sharing an ID both appear, and the detail pane warns on each.
- [ ] Malformed frontmatter shows the warning state and is not rewritten.

## Schema editing
- [ ] Adding a field makes it appear on every task's detail pane, empty.
- [ ] A duplicate or reserved key is rejected with a notice.
- [ ] Renaming a field's label changes the GUI and touches no files.
- [ ] Reordering a field reorders it in the detail pane.
- [ ] Deleting a field hides it but leaves the frontmatter key in the file.
- [ ] "Clean up orphaned keys" finds that key, asks for confirmation, and removes it.
- [ ] Changing the tasks folder re-indexes against the new folder.
```

- [ ] **Step 4: Fix what the checklist finds**

Any failure here is a bug in an earlier task. Fix it in the module that owns
the behaviour, add a unit test if the module is one of the pure ones, and note
it in the commit message.

- [ ] **Step 5: Write `README.md`**

```markdown
# Obsidian Task Tracker

A Jira-style task tracker for Obsidian. Tasks are plain markdown files in a
flat folder; filtering, editing and comments happen in a two-pane GUI.

## Features

- Two-pane view: filterable task list, structured detail pane.
- Search, filter chips, sort, group-by, and a hide-done toggle.
- Fields you define yourself from settings — text, number, date, select,
  multi-select, checkbox, person.
- Comments with author and timestamp, editable in place.
- Every task is a normal markdown file that still reads well without the plugin.

## Task file format

```markdown
---
id: TASK-42
title: Fix login redirect
status: In Progress
assignee: Ahmed
due: 2026-09-28
created: 2026-09-21T08:45:00
updated: 2026-09-21T09:10:00
---

## Description

The redirect loops when the session cookie is stale.

## Comments

### Ahmed — 2026-09-21T09:10:00
Reproduced on staging.
```

Anything else you write in the file is left alone by the plugin.

## Settings

- **Tasks folder** — where task files live. Flat; subfolders are ignored.
- **ID prefix** — `TASK` produces `TASK-1`, `TASK-2`, …
- **Your name** — the author stamped on comments.
- **Fields** — add, rename, reorder, and delete the fields every task has. A
  field's key is its frontmatter key and is fixed once created; its label is
  free to change.
- **Status field / done statuses** — which field drives "hide done".
- **Due date field** — drives the due and overdue badges.

Deleting a field hides it but leaves the data in your files. Use
**Clean up orphaned frontmatter keys** when you want it gone for good.

## Development

```bash
npm install
cp .env.example .env   # set VAULT_PATH to the vault you test against
npm run dev            # watch build, copies into the vault on each rebuild
npm test               # unit tests
npm run typecheck
```

`docs/manual-test.md` is the checklist for the parts unit tests can't reach.
```

- [ ] **Step 6: Run the full suite one last time**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS, no type errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/manual-test.md
git commit -m "docs: add README and manual test checklist"
```

---

## Notes for the implementer

- **The riskiest contract in this codebase is `src/model/edit.ts`.** Every
  function there must leave untouched bytes untouched. If a test in Task 5
  fails, fix the splice arithmetic rather than loosening the test.
- **Never call `vault.modify` from `ui/`.** Every mutation goes through
  `TaskWriter`, which is what keeps the "one place where disk contract mistakes
  can happen" property the design depends on.
- **`src/schema/`, `src/model/` and `src/query/` must not import `obsidian`.**
  If you find yourself wanting to, the thing you want belongs in `index/`,
  `write/` or `ui/`.
- **The index holds frontmatter-only tasks until a body is loaded.** A task's
  `description` and `comments` are empty until `loadBody` runs for its path.
  Only the detail pane needs them; do not make the list depend on them.
