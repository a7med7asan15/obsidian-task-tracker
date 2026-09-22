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
