import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { onSyncProgress } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { initSpatialNav } from "../lib/nav";
import type { SyncProgress } from "../lib/types";
import { cx } from "../lib/utils";

const ICONS: Record<string, ReactNode> = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
    </svg>
  ),
  live: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="14" rx="2" /><path d="m8 2 4 4 4-4" />
    </svg>
  ),
  movies: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 9h20M7 4v5M17 4v5" />
    </svg>
  ),
  series: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  ),
  favorites: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 21s-7.5-4.7-10-9.2C.6 8.4 2.3 4.5 6 4.1c2.1-.2 4 .9 6 3 2-2.1 3.9-3.2 6-3 3.7.4 5.4 4.3 4 7.7-2.5 4.5-10 9.2-10 9.2z" />
    </svg>
  ),
  history: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  ),
  sources: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.09a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
    </svg>
  ),
};

function SyncToasts() {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Record<number, SyncProgress>>({});

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onSyncProgress((p) => {
      setToasts((prev) => ({ ...prev, [p.jobId]: p }));
      if (p.finished) {
        setTimeout(() => {
          setToasts((prev) => {
            const next = { ...prev };
            delete next[p.jobId];
            return next;
          });
        }, 5000);
      }
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const list = Object.values(toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-80 flex-col gap-2">
      <AnimatePresence>
        {list.map((p) => {
          const pct =
            p.total && p.total > 0 ? Math.min(100, Math.round((p.processed / p.total) * 100)) : null;
          const isError = p.phase === "error";
          return (
            <motion.div
              key={p.jobId}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className={cx(
                "rounded-xl border p-3 shadow-xl backdrop-blur",
                isError ? "border-danger/40 bg-danger/10" : "border-line bg-bg-elevated/95",
              )}
            >
              <p className="text-sm font-semibold text-ink">
                {t(`sync.${p.phase}`)}
                {pct !== null && !p.finished && ` · ${pct}%`}
              </p>
              {p.message && <p className="mt-0.5 text-xs text-ink-dim">{p.message}</p>}
              {!p.finished && (
                <div className="mt-2 h-1 overflow-hidden rounded bg-line">
                  <div
                    className={cx("h-full bg-accent", pct === null && "w-1/3 animate-pulse")}
                    style={pct !== null ? { width: `${pct}%` } : undefined}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => initSpatialNav(() => navigate(-1)), [navigate]);

  // Global shortcut: "/" focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target as HTMLElement)?.closest("input, textarea")) {
        e.preventDefault();
        navigate("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const mainNav = ["home", "live", "movies", "series", "search", "favorites", "history"] as const;
  const bottomNav = ["sources", "settings"] as const;
  const paths: Record<string, string> = {
    home: "/",
    live: "/live",
    movies: "/movies",
    series: "/series",
    search: "/search",
    favorites: "/favorites",
    history: "/history",
    sources: "/sources",
    settings: "/settings",
  };

  const renderLink = (key: string) => (
    <NavLink
      key={key}
      to={paths[key]}
      data-nav
      className={({ isActive }) =>
        cx(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-accent-soft text-accent-strong"
            : "text-ink-dim hover:bg-surface-hover hover:text-ink",
        )
      }
    >
      <span className="shrink-0">{ICONS[key]}</span>
      <span className="hidden lg:inline">{t(`nav.${key}`)}</span>
    </NavLink>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <motion.aside
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex w-16 shrink-0 flex-col border-r border-line bg-bg-elevated p-2 lg:w-56 lg:p-3"
      >
        <div className="mb-6 flex items-center gap-2 px-2 pt-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-strong font-black text-white shadow-lg">
            F
          </div>
          <span className="hidden text-lg font-extrabold tracking-tight text-ink lg:inline">
            Fable&nbsp;TV
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">{mainNav.map(renderLink)}</nav>
        <nav className="flex flex-col gap-1 border-t border-line pt-2">
          {bottomNav.map(renderLink)}
        </nav>
      </motion.aside>

      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <SyncToasts />
    </div>
  );
}
