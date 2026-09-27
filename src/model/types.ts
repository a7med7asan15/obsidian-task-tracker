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
  /**
   * False for the frontmatter-only stub the index builds without reading the
   * file: `description` and `comments` are then empty because they were never
   * read, not because the note has none. Nothing may write them back yet.
   */
  bodyLoaded: boolean;
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
