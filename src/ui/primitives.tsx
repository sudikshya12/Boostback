import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-ink text-[#0b1622] hover:bg-white shadow-[0_6px_24px_-8px_rgba(243,237,226,0.55)] font-semibold',
  secondary: 'bg-white/8 text-ink hover:bg-white/14 border border-white/14',
  ghost: 'text-ink-dim hover:text-ink hover:bg-white/8',
  danger: 'bg-danger/15 text-ink border border-danger/40 hover:bg-danger/25',
};

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-11 text-[15px] transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  pressed,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`panel inline-flex items-center justify-center size-11 rounded-xl text-ink-dim hover:text-ink transition-colors cursor-pointer ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Accessible single-choice segmented control (radio group). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
  size = 'md',
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  const onKey = (e: React.KeyboardEvent) => {
    let n = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (idx - 1 + options.length) % options.length;
    else return;
    e.preventDefault();
    e.stopPropagation();
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-xl bg-black/25 p-1 border border-white/10 ${className}`} onKeyDown={onKey}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${size === 'sm' ? 'px-2.5 min-h-9 text-[13px]' : 'px-3.5 min-h-10 text-[14px]'} ${
              active ? 'bg-ink text-[#0b1622] font-semibold' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Modal dialog with focus management and Escape to close. */
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const items = Array.from(
          el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'),
        );
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 fade-in" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
        className={`panel !bg-panel-solid/95 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[min(88vh,820px)] overflow-y-auto rise-in`}
      >
        <div className="sticky top-0 flex items-center justify-between px-5 pt-4 pb-3 bg-panel-solid/95 border-b border-white/8 z-10">
          <h2 id={id} className="text-[17px] font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="size-10 inline-flex items-center justify-center rounded-lg text-ink-dim hover:text-ink hover:bg-white/8 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-md border border-white/20 bg-white/8 text-[12px] text-ink">
      {children}
    </kbd>
  );
}
