import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { cx } from "../lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent",
        className,
      )}
      role="status"
    />
  );
}

export function SkeletonRow({ count = 6, poster = false }: { count?: number; poster?: boolean }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="shrink-0">
          <div
            className={cx(
              "skeleton rounded-xl",
              poster ? "h-56 w-36" : "h-32 w-56",
            )}
          />
          <div className="skeleton mt-2 h-3 w-24 rounded" />
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-3 py-20 text-center"
    >
      <div className="text-5xl opacity-60">{icon ?? "📺"}</div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {subtitle && <p className="max-w-md text-sm text-ink-dim">{subtitle}</p>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
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
  variant?: "primary" | "ghost" | "danger" | "soft";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  autoFocus?: boolean;
}) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-strong",
    soft: "bg-accent-soft text-accent-strong hover:bg-accent hover:text-white",
    ghost: "bg-surface text-ink hover:bg-surface-hover border border-line",
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
        "rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className={cx(
              "max-h-[88vh] w-full overflow-y-auto rounded-2xl border border-line bg-bg-elevated p-6 shadow-2xl",
              wide ? "max-w-3xl" : "max-w-lg",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
              <button
                data-nav
                onClick={onClose}
                aria-label={t("common.close")}
                className="ml-auto rounded-full p-2 text-ink-dim transition-colors hover:bg-surface-hover hover:text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
      <p className="mb-6 text-sm text-ink-dim">{message}</p>
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
      className="flex w-full items-center justify-between gap-4 rounded-xl px-1 py-2 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-dim">{hint}</span>}
      </span>
      <span
        className={cx(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-line",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-dim">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim/60 focus:border-accent focus:outline-none";

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
