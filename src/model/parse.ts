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
