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
