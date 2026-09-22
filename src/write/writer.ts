import { addComment, deleteComment, editComment, setDescription } from '../model/edit';
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

// A plain YAML scalar is unsafe (needs quoting) when it starts with a flow
// indicator or other reserved character (so it isn't misread as a flow
// sequence/mapping/anchor/tag/comment), has significant leading/trailing
// whitespace, contains a colon-space (a mapping separator) or space-hash (a
// comment start), is empty, or looks like an ISO date/timestamp -- YAML's
// core schema implicitly resolves an unquoted scalar of that shape to a
// !!timestamp, which would silently turn `created`/`updated` into a
// non-string type for any spec-following parser.
const UNSAFE_SCALAR_START = /^[[\]{}#&*!|>'"%@`]/;
const LOOKS_LIKE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}([Tt ]|$)/;

function needsQuoting(s: string): boolean {
  return (
    s.length === 0 ||
    /^\s/.test(s) ||
    /\s$/.test(s) ||
    UNSAFE_SCALAR_START.test(s) ||
    /: |:$/.test(s) ||
    / #/.test(s) ||
    LOOKS_LIKE_TIMESTAMP.test(s)
  );
}

function yamlScalar(v: unknown): string {
  const s = String(v);
  return needsQuoting(s) ? JSON.stringify(s) : s;
}

/**
 * YAML scalar/flow-sequence rendering for `createTask`'s hand-built initial
 * frontmatter block. This is the one place a field value still has to be
 * turned into YAML text by hand: the file doesn't exist yet, so there's
 * nothing for `VaultAdapter#processFrontmatter` to mutate. Every other
 * write goes through `processFrontmatter`, which serializes correctly on
 * its own. Array items get the same escaping as top-level scalars -- they
 * used to get none at all.
 */
function yamlValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((item) => yamlScalar(item)).join(', ')}]`;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return yamlScalar(v);
}

function applyField(fm: Record<string, unknown>, key: string, value: unknown): void {
  if (isEmptyValue(value)) delete fm[key];
  else fm[key] = value;
}

/** `idPrefix` is free-text in the settings tab; escape it before it goes
 * into a RegExp so a metacharacter (`(`, `.`, ...) can't throw or silently
 * change what the pattern matches. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class TaskWriter {
  constructor(
    private vault: VaultAdapter,
    private settings: () => TaskTrackerSettings,
  ) {}

  nextId(existingIds: string[]): string {
    const prefix = this.settings().idPrefix;
    const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`);
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
    fm.push(`created: ${yamlValue(now)}`, `updated: ${yamlValue(now)}`);

    const content = `---\n${fm.join('\n')}\n---\n\n## Description\n\n\n\n## Comments\n\n`;
    const path = await this.freePath(
      `${tasksFolder}/${sanitizeFilename(`${id} ${title}`)}.md`,
    );
    await this.vault.create(path, content);
    return path;
  }

  /**
   * Rewrite the file's body (description/comments) via the surgical,
   * offset-based `model/edit` functions, then stamp `updated` in a
   * separate `processFrontmatter` pass. Only the second step touches
   * frontmatter, so -- unlike the old two-pass string-surgery `touch` --
   * there is exactly one frontmatter mutation here, not two. That matters:
   * the old double-pass was the direct cause of Critical 2 (a second pass
   * mis-parsing the frontmatter block the first pass had just created).
   */
  private async touchBody(path: string, transform: (content: string) => string): Promise<void> {
    const content = await this.vault.read(path);
    await this.vault.write(path, transform(content));
    await this.vault.processFrontmatter(path, (fm) => {
      fm.updated = formatTimestamp(new Date());
    });
  }

  async setField(path: string, key: string, value: unknown): Promise<void> {
    await this.vault.processFrontmatter(path, (fm) => {
      applyField(fm, key, value);
      fm.updated = formatTimestamp(new Date());
    });
  }

  async setTitle(path: string, title: string): Promise<string> {
    const { tasksFolder } = this.settings();
    let id: string | undefined;
    await this.vault.processFrontmatter(path, (fm) => {
      fm.title = title;
      fm.updated = formatTimestamp(new Date());
      id = typeof fm.id === 'string' ? fm.id : undefined;
    });

    if (id === undefined) return path;

    const target = `${tasksFolder}/${sanitizeFilename(`${id} ${title}`)}.md`;
    if (target === path) return path;
    if (await this.vault.exists(target)) return path;

    await this.vault.rename(path, target);
    return target;
  }

  async setDescriptionAt(path: string, description: string): Promise<void> {
    await this.touchBody(path, (c) => setDescription(c, description));
  }

  async addCommentAt(path: string, body: string, now: Date = new Date()): Promise<void> {
    const author = this.settings().authorName;
    await this.touchBody(path, (c) => addComment(c, author, formatTimestamp(now), body));
  }

  async editCommentAt(path: string, commentId: string, body: string): Promise<void> {
    await this.touchBody(path, (c) => editComment(c, commentId, body));
  }

  async deleteCommentAt(path: string, commentId: string): Promise<void> {
    await this.touchBody(path, (c) => deleteComment(c, commentId));
  }
}
