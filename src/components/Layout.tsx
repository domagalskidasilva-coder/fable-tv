import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { onSyncProgress } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { initSpatialNav } from "../lib/nav";
import type { SyncProgress } from "../lib/types";
import { cx } from "../lib/utils";
import { EASE, gsap, useGsap } from "../lib/gsap";
import { BottomNav, TopNav } from "./TopNav";

function Toast({ p }: { p: SyncProgress }) {
  const { t } = useI18n();
  const ref = useGsap((self) => {
    gsap.from(self, { autoAlpha: 0, x: 60, duration: 0.4, ease: EASE.pop });
  });
  const pct =
    p.total && p.total > 0 ? Math.min(100, Math.round((p.processed / p.total) * 100)) : null;
  const isError = p.phase === "error";
  const isDone = p.phase === "done";
  return (
    <div
      ref={ref}
      className={cx(
        "pointer-events-auto rounded-2xl border p-3.5 shadow-2xl backdrop-blur-xl",
        isError
          ? "border-danger/40 bg-danger/10"
          : isDone
            ? "border-ok/40 bg-ok/10"
            : "border-line bg-bg-elevated/95",
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        {!p.finished && <span className="h-2 w-2 animate-pulse rounded-full bg-accent-strong" />}
        {t(`sync.${p.phase}`)}
        {pct !== null && !p.finished && ` · ${pct}%`}
      </p>
      {p.message && <p className="mt-0.5 line-clamp-2 text-xs text-ink-dim">{p.message}</p>}
      {!p.finished && (
        <div className="mt-2 h-1 overflow-hidden rounded bg-line">
          <div
            className={cx("h-full bg-brand", pct === null && "w-1/3 animate-pulse")}
            style={pct !== null ? { width: `${pct}%` } : undefined}
          />
        </div>
      )}
    </div>
  );
}

function SyncToasts() {
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
        }, 4500);
      }
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const list = Object.values(toasts);
  if (list.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-80 flex-col gap-2 md:bottom-4">
      {list.map((p) => (
        <Toast key={p.jobId} p={p} />
      ))}
    </div>
  );
}

export function Layout({
  children,
  onSettingsChanged,
}: {
  children: ReactNode;
  onSettingsChanged: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  useEffect(() => initSpatialNav(() => navigate(-1)), [navigate]);

  // Global shortcut: "/" jumps to search.
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

  const transitionRef = useGsap<HTMLDivElement>(
    (self) => {
      gsap.fromTo(
        self,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.45, ease: EASE.soft },
      );
    },
    [location.pathname],
  );

  return (
    <div className="relative h-screen overflow-hidden bg-bg">
      <main className="h-full">
        <div
          key={location.pathname}
          ref={transitionRef}
          className={cx("h-full", isHome ? "pb-16 md:pb-0" : "pt-14 pb-16 md:pb-0")}
        >
          {children}
        </div>
      </main>

      <TopNav onSettingsChanged={onSettingsChanged} />
      <BottomNav />
      <SyncToasts />
    </div>
  );
}
