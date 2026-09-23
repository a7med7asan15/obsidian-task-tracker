import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

interface Props {
  /** Text on the closed button, e.g. "Sprint". */
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear?: () => void;
  /** Show the selected values on the button instead of a count. */
  showValues?: boolean;
}

/** Past this many options the popover gets a search box. */
const SEARCH_THRESHOLD = 8;
/** Gap kept between the popover and the edge of the pane it opens in. */
const EDGE_GAP = 4;

/**
 * A compact button that opens a searchable checkbox list. Used for filters
 * and for multi-select fields, where a long option list (sprints,
 * components, ...) would otherwise take over the pane.
 */
export function MultiPicker({ label, options, selected, onToggle, onClear, showValues }: Props) {
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; maxWidth?: number }>({ left: 0 });

  // The panes clip overflow, so a popover hanging past the pane's right edge
  // would be cut off -- and focusing its search box would scroll the whole
  // pane sideways to reveal it. Slide it left to fit inside the pane instead.
  useLayoutEffect(() => {
    if (!open || !root.current || !pop.current) { setPlace({ left: 0 }); return; }
    const pane = root.current.closest('.tt-sidebar, .tt-detail, .modal') ?? root.current.ownerDocument.body;
    const bound = pane.getBoundingClientRect();
    const btn = root.current.getBoundingClientRect();
    const maxWidth = bound.width - 2 * EDGE_GAP;
    const width = Math.min(pop.current.offsetWidth, maxWidth);
    const overflow = btn.left + width - (bound.right - EDGE_GAP);
    setPlace({
      left: overflow > 0 ? -Math.min(overflow, btn.left - bound.left - EDGE_GAP) : 0,
      maxWidth,
    });
  }, [open]);

  useEffect(() => { if (open) search.current?.focus({ preventScroll: true }); }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Popout windows have their own document, so listen on the one we render in.
    const doc = root.current?.ownerDocument ?? document;
    doc.addEventListener('mousedown', close);
    doc.addEventListener('keydown', esc);
    return () => {
      doc.removeEventListener('mousedown', close);
      doc.removeEventListener('keydown', esc);
    };
  }, [open]);

  const lowered = needle.trim().toLowerCase();
  const visible = lowered === ''
    ? options
    : options.filter((o) => o.toLowerCase().includes(lowered));
  // A selected value no longer among the options must still be clearable.
  const extra = selected.filter((v) => !options.includes(v));

  const summary = selected.length === 0
    ? null
    : showValues
      ? selected.join(', ')
      : String(selected.length);

  return (
    <div class="tt-picker" ref={root}>
      <button
        class={`tt-picker-btn${selected.length > 0 ? ' is-active' : ''}`}
        onClick={() => { setOpen(!open); setNeedle(''); }}
        title={selected.length > 0 ? `${label}: ${selected.join(', ')}` : label}
      >
        {label && <span class="tt-picker-label">{label}</span>}
        {summary !== null && <span class="tt-picker-summary">{summary}</span>}
        <span class="tt-picker-caret">▾</span>
      </button>
      {open && (
        <div class="tt-picker-pop" ref={pop} style={{
          left: `${place.left}px`,
          maxWidth: place.maxWidth === undefined ? undefined : `${place.maxWidth}px`,
        }}>
          {options.length > SEARCH_THRESHOLD && (
            <input
              class="tt-picker-search"
              type="search"
              placeholder={label ? `Find ${label.toLowerCase()}…` : 'Find…'}
              value={needle}
              ref={search}
              onInput={(e) => setNeedle((e.target as HTMLInputElement).value)}
            />
          )}
          <div class="tt-picker-list">
            {[...extra, ...visible].map((o) => (
              <label class="tt-picker-opt" key={o}>
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() => onToggle(o)}
                />
                <span>{o}</span>
              </label>
            ))}
            {visible.length === 0 && extra.length === 0 && (
              <div class="tt-picker-none">No matches</div>
            )}
          </div>
          {onClear && selected.length > 0 && (
            <button class="tt-picker-clear" onClick={() => { onClear(); setOpen(false); }}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
