import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Comment, Task } from '../model/types';
import type { FieldDef } from '../schema/types';
import { FieldWidget } from './FieldWidget';
import { dueBadge } from './dates';
import { PROJECT_KEY } from '../settings/projects';

interface Props {
  task: Task;
  schema: FieldDef[];
  dueFieldKey: string | null;
  statusFieldKey: string;
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

/** Initials for the avatar circle; falls back to the first non-space char. */
function initials(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Read-only text for a frontmatter value of any shape. */
function showValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(showValue).join(', ');
  return JSON.stringify(v) ?? '';
}

function formatCommentTime(ts: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(ts);
  if (!m) return ts.replace('T', ' ');
  const [, y, mo, d, hh, mm] = m;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(mo) - 1] ?? mo;
  return `${Number(d)} ${month} ${y}, ${hh}:${mm}`;
}

function CommentItem({
  comment, isEditing, draft, onEditDraft, onStartEdit, onCancelEdit, onSave, onDelete,
}: {
  comment: Comment;
  isEditing: boolean;
  draft: string;
  onEditDraft: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div class={`tt-comment${isEditing ? ' is-editing' : ''}`}>
      <div class="tt-avatar" aria-hidden="true">{initials(comment.author)}</div>
      <div class="tt-comment-main">
        <div class="tt-comment-head">
          <span class="tt-comment-author">{comment.author}</span>
          <span class="tt-comment-time" title={comment.timestamp}>
            {formatCommentTime(comment.timestamp)}
          </span>
          <span class="tt-comment-actions">
            <button class="tt-icon-btn" onClick={onStartEdit}>Edit</button>
            <button class="tt-icon-btn tt-danger" onClick={onDelete}>Delete</button>
          </span>
        </div>
        {isEditing ? (
          <div class="tt-comment-editor">
            <textarea
              rows={3}
              value={draft}
              onInput={(e) => onEditDraft((e.target as HTMLTextAreaElement).value)}
            />
            <div class="tt-comment-editor-actions">
              <button class="mod-cta" onClick={onSave}>Save</button>
              <button onClick={onCancelEdit}>Cancel</button>
            </div>
          </div>
        ) : (
          <div class="tt-comment-body">{comment.body}</div>
        )}
      </div>
    </div>
  );
}

export function TaskDetail(props: Props) {
  const { task, schema, dueFieldKey } = props;
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const titleBox = useRef<HTMLTextAreaElement>(null);

  // The title wraps to show in full, so grow the box to fit its text --
  // on every edit and whenever the pane's width changes the wrapping.
  const fitTitle = () => {
    const el = titleBox.current;
    if (!el) return;
    el.setCssProps({ height: 'auto' });
    el.setCssProps({ height: `${el.scrollHeight}px` });
  };
  useLayoutEffect(fitTitle, [title]);
  useEffect(() => {
    if (!titleBox.current) return;
    let lastWidth = 0;
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === lastWidth) return;
      lastWidth = entry.contentRect.width;
      fitTitle();
    });
    ro.observe(titleBox.current);
    return () => ro.disconnect();
  }, []);

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
  const statusDef = schema.find((f) => f.key === props.statusFieldKey);
  const rawStatus = task.fields[props.statusFieldKey];
  const statusValue = typeof rawStatus === 'string' ? rawStatus : null;
  // Values for fields this project doesn't define: shown, never dropped silently.
  const known = new Set([PROJECT_KEY, ...schema.map((f) => f.key)]);
  const others = Object.entries(task.fields)
    .filter(([k, v]) => !known.has(k) && v !== null && v !== undefined && v !== '');

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
        <span class="tt-id tt-id-lg">{task.id ?? 'no id'}</span>
        {statusValue && (
          <span class={`tt-status-pill tt-status-${statusValue.toLowerCase().replace(/\s+/g, '-')}`}>
            {statusValue}
          </span>
        )}
        {badge && <span class={`tt-badge tt-due-${badge.tone}`}>{badge.text}</span>}
        <button class="tt-icon-btn tt-open-note" onClick={props.onOpenAsNote}>
          Open as note
        </button>
      </div>

      <textarea
        ref={titleBox}
        class="tt-title-input"
        rows={1}
        value={title}
        placeholder="Issue title"
        // Titles are one line in the file: Enter commits, pasted newlines become spaces.
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
        }}
        onInput={(e) => setTitle((e.target as HTMLTextAreaElement).value.replace(/\s*\n\s*/g, ' '))}
        onBlur={() => { if (title.trim() && title !== task.title) props.onSetTitle(title.trim()); }}
      />

      <section class="tt-section">
        <h3 class="tt-section-title">Details</h3>
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
        {statusDef && statusValue === null && (
          <div class="tt-field-hint">No status set yet.</div>
        )}
      </section>

      {others.length > 0 && (
        <section class="tt-section">
          <h3 class="tt-section-title">Other properties</h3>
          <div class="tt-fields">
            {others.map(([k, v]) => (
              <div class="tt-field" key={k}>
                <label class="tt-field-label">{k}</label>
                <div class="tt-field-input tt-field-readonly">
                  {showValue(v)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section class="tt-section">
        <h3 class="tt-section-title">Description</h3>
        <textarea
          class="tt-description"
          rows={8}
          placeholder="Add a description…"
          value={description}
          onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
          onBlur={() => { if (description !== task.description) props.onSetDescription(description); }}
        />
      </section>

      <section class="tt-section">
        <h3 class="tt-section-title">
          Comments
          <span class="tt-count">{task.comments.length}</span>
        </h3>
        <div class="tt-comments">
          {task.comments.length === 0 && (
            <div class="tt-comments-empty">No comments yet. Start the conversation below.</div>
          )}
          {task.comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              isEditing={editingId === c.id}
              draft={editingBody}
              onEditDraft={setEditingBody}
              onStartEdit={() => { setEditingId(c.id); setEditingBody(c.body); }}
              onCancelEdit={() => setEditingId(null)}
              onSave={() => { props.onEditComment(c.id, editingBody); setEditingId(null); }}
              onDelete={() => props.onDeleteComment(c.id)}
            />
          ))}
        </div>

        <div class="tt-comment-composer">
          <textarea
            class="tt-new-comment"
            rows={3}
            placeholder="Add a comment…"
            value={newComment}
            onInput={(e) => setNewComment((e.target as HTMLTextAreaElement).value)}
          />
          <button
            class="mod-cta tt-comment-submit"
            disabled={newComment.trim().length === 0}
            onClick={() => { props.onAddComment(newComment.trim()); setNewComment(''); }}
          >
            Comment
          </button>
        </div>
      </section>
    </div>
  );
}
