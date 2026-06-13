import { useEffect, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { cx } from "../lib/utils";
import { EASE, gsap, useGsap, usePresence } from "../lib/gsap";

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-accent-strong",
        className,
      )}
      role="status"
      aria-label="loading"
    />
  );
}

export function SkeletonRow({ count = 7, poster = false }: { count?: number; poster?: boolean }) {
  return (
    <div className="flex gap-4 overflow-hidden px-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="shrink-0">
          <div className={cx("skeleton rounded-2xl", poster ? "h-60 w-40" : "h-28 w-52")} />
          <div className="skeleton mt-2.5 h-3 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ poster = true }: { poster?: boolean }) {
  return (
    <div
      className={cx(
        "grid gap-4",
        poster
          ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
          : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
      )}
    >
      {Array.from({ length: poster ? 21 : 15 }).map((_, i) => (
        <div key={i}>
          <div className={cx("skeleton rounded-2xl", poster ? "aspect-[2/3]" : "aspect-video")} />
          <div className="skeleton mt-2.5 h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const ref = useGsap((self) => {
    gsap.from(self.children, { autoAlpha: 0, y: 18, stagger: 0.08, duration: 0.5, ease: EASE.out });
  });
  return (
    <div ref={ref} className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="mb-1 grid h-20 w-20 place-items-center rounded-3xl bg-surface/70 text-4xl shadow-inner">
        {icon ?? "📺"}
      </div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {subtitle && <p className="max-w-md text-sm leading-relaxed text-ink-dim">{subtitle}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className,
  type = "button",
  autoFocus,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft" | "light";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  autoFocus?: boolean;
}) {
  const styles = {
    primary: "bg-brand text-white shadow-lg hover:brightness-110 glow-accent",
    light: "bg-white text-black hover:bg-white/90 shadow-lg",
    soft: "bg-accent-soft text-accent-strong hover:bg-accent hover:text-white",
    ghost: "bg-white/8 text-ink hover:bg-white/15 border border-line/60 backdrop-blur",
    danger: "bg-danger/15 text-danger hover:bg-danger hover:text-white",
  }[variant];
  return (
    <button
      type={type}
      data-nav
      autoFocus={autoFocus}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "rounded-xl px-4 py-2 text-sm font-semibold transition-[filter,background-color,color] duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();

  const { rendered, ref } = usePresence(
    open,
    (el) => {
      const panel = el.querySelector("[data-panel]");
      const tl = gsap.timeline();
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, ease: EASE.soft });
      if (panel) {
        tl.fromTo(
          panel,
          { autoAlpha: 0, y: 30, scale: 0.94 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: EASE.pop },
          "-=0.1",
        );
      }
      return tl;
    },
    (el) => {
      const panel = el.querySelector("[data-panel]");
      const tl = gsap.timeline();
      if (panel) tl.to(panel, { autoAlpha: 0, y: 16, scale: 0.97, duration: 0.2, ease: EASE.soft });
      tl.to(el, { autoAlpha: 0, duration: 0.2 }, "-=0.1");
      return tl;
    },
  );

  useEffect(() => {
    if (!open) return;
    document.body.setAttribute("data-modal-open", "true");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.removeAttribute("data-modal-open");
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  if (!rendered) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        data-panel
        className={cx(
          "max-h-[88vh] w-full overflow-y-auto rounded-3xl border border-line bg-bg-elevated/95 p-6 shadow-2xl",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          {title && <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>}
          <button
            data-nav
            onClick={onClose}
            aria-label={t("common.close")}
            className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-dim transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({
  open,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onCancel} title={t("common.confirmTitle")}>
      <p className="mb-6 text-sm leading-relaxed text-ink-dim">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="danger" onClick={onConfirm} autoFocus>
          {t("common.delete")}
        </Button>
      </div>
    </Modal>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      data-nav
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-hover/50"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-ink-dim">{hint}</span>}
      </span>
      <span
        className={cx(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300",
          checked ? "bg-brand" : "bg-line",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-dim">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-surface/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-colors";

export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path
        d="M12 21s-7.5-4.7-10-9.2C.6 8.4 2.3 4.5 6 4.1c2.1-.2 4 .9 6 3 2-2.1 3.9-3.2 6-3 3.7.4 5.4 4.3 4 7.7-2.5 4.5-10 9.2-10 9.2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlayIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5v13l11-6.5L8 5.5z" />
    </svg>
  );
}

export function InfoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5" strokeLinecap="round" />
      <circle cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}
