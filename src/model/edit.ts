import { locateSections, parseComments } from './parse';
import type { Comment } from './types';

/**
 * `locateSections` finds section boundaries by scanning for the next
 * top-level `## ` heading anywhere in the document (see parse.ts). That
 * makes it possible for a description or comment body that itself contains
 * an ordinary markdown `## Sub heading` to be mistaken for a real section
 * boundary (e.g. the start of the next `## Comments`), which corrupts the
 * write: re-saving the same text duplicates content and truncates the
 * parsed description/comment body.
 *
 * To keep `locateSections`'s simple "next `##` heading" rule correct, any
 * top-level `## ` heading found INSIDE user-authored content is demoted one
 * level (`## ` -> `### `) before it is written to disk. This is a disclosed,
 * intentional trade-off: a user's own `##` heading inside a description or
 * comment renders as `###` once saved. It is not silent data loss — the
 * heading and its text are preserved, just one level down — and it is far
 * preferable to the alternative (duplicated content / truncated parsing).
 * Deeper headings (`###`, `####`, ...) and single `#` headings are left
 * alone since they never collide with the `## ` boundary matcher.
 */
function demoteTopLevelHeadings(text: string): string {
  return text.replace(/^##(?=\s)/gm, '###');
}

export function formatComment(author: string, timestamp: string, body: string): string {
  return `### ${author} — ${timestamp}\n${demoteTopLevelHeadings(body.trim())}\n`;
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
  // locateSections' heading regex can absorb a variable number of trailing
  // newlines into the heading match itself, so `range[0]` doesn't sit at a
  // fixed offset relative to "## <title>". Strip any trailing newlines here
  // before applying the deterministic padding below, so the result depends
  // only on `body` — not on how many newlines the regex happened to consume.
  const before = content.slice(0, range[0]).replace(/\n+$/, '');
  return before + padded + content.slice(range[1]);
}

export function setDescription(content: string, description: string): string {
  const s = locateSections(content);
  return replaceSection(
    content,
    'Description',
    [s.descriptionStart, s.descriptionEnd],
    demoteTopLevelHeadings(description),
  );
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
