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
