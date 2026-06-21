import { useId, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { cx } from "../lib/utils";
import { EASE, gsap, useGsap } from "../lib/gsap";

/** Slow-drifting blurred gradient blobs for a living, premium backdrop. */
export function Aurora({ className }: { className?: string }) {
  const ref = useGsap<HTMLDivElement>((self) => {
    const blobs = self.querySelectorAll("[data-blob]");
    blobs.forEach((b, i) => {
      gsap.to(b, {
        x: i % 2 === 0 ? 60 : -50,
        y: i % 2 === 0 ? -40 : 50,
        scale: 1.15,
        duration: 9 + i * 3,
        ease: EASE.inOut,
        repeat: -1,
        yoyo: true,
      });
    });
  });
  return (
    <div
      ref={ref}
      aria-hidden
      className={cx("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
    >
      <div
        data-blob
        className="absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-40 blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
      />
      <div
        data-blob
        className="absolute right-0 top-1/3 h-[28rem] w-[28rem] rounded-full opacity-30 blur-[100px]"
        style={{ background: "radial-gradient(circle, var(--accent-2), transparent 70%)" }}
      />
      <div
        data-blob
        className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full opacity-20 blur-[90px]"
        style={{ background: "radial-gradient(circle, #2dd4bf, transparent 70%)" }}
      />
    </div>
  );
}

/** Consistent premium page header with a big title and optional count + actions. */
export function PageHeader({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count?: number | null;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useGsap<HTMLDivElement>((self) => {
    gsap.from(self.querySelectorAll("[data-h]"), {
      autoAlpha: 0,
      y: 16,
      duration: 0.5,
      stagger: 0.08,
      ease: EASE.out,
    });
  });
  return (
    <div ref={ref} className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div data-h className="flex items-center gap-3">
        {icon && (
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-ink md:text-4xl">{title}</h1>
          {count != null && (
            <p className="mt-0.5 text-sm text-ink-dim">{t("common.items", { n: count })}</p>
          )}
        </div>
      </div>
      {children && (
        <div data-h className="flex flex-wrap items-center gap-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      data-nav
      onClick={onClick}
      className={cx(
        "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200",
        active
          ? "bg-brand text-white shadow-md"
          : "bg-surface/80 text-ink-dim hover:bg-surface-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("relative", className)}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <input
        id={id}
        data-nav
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-surface/80 py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
    </div>
  );
}
