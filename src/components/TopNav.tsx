import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { listProfiles } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { Profile } from "../lib/types";
import { cx } from "../lib/utils";
import { EASE, gsap, usePresence } from "../lib/gsap";

const PRIMARY = ["home", "live", "movies", "series", "favorites"] as const;

const PATHS: Record<string, string> = {
  home: "/",
  live: "/live",
  movies: "/movies",
  series: "/series",
  favorites: "/favorites",
  search: "/search",
  history: "/history",
  profiles: "/profiles",
  settings: "/settings",
};

function ProfileMenu({ onSwitchProfile }: { onSwitchProfile: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Profile | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProfiles()
      .then((ps) => setActive(ps.find((p) => p.active) ?? ps[0] ?? null))
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const { rendered, ref } = usePresence(
    open,
    (el) => gsap.fromTo(el, { autoAlpha: 0, y: -8, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.22, ease: EASE.pop, transformOrigin: "top right" }),
    (el) => gsap.to(el, { autoAlpha: 0, y: -8, scale: 0.97, duration: 0.15, ease: EASE.soft }),
  );

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const links: Array<[string, string]> = [
    ["/profiles", "nav.profiles"],
    ["/history", "nav.history"],
    ["/settings", "nav.settings"],
  ];

  return (
    <div ref={wrap} className="relative">
      <button
        data-nav
        onClick={() => setOpen((v) => !v)}
        aria-label="perfil"
        className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-bg shadow-sm transition-transform hover:scale-105"
        style={{ background: active?.color ?? "var(--accent)" }}
      >
        {(active?.name ?? "F").slice(0, 1).toUpperCase()}
      </button>

      {rendered && (
        <div
          ref={ref}
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-bg-elevated/95 p-2 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <span
              className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-bg"
              style={{ background: active?.color ?? "var(--accent)" }}
            >
              {(active?.name ?? "F").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{active?.name ?? "Fable"}</p>
              <p className="text-[11px] text-ink-faint">{t("profiles.active")}</p>
            </div>
          </div>

          <button
            data-nav
            onClick={() => {
              setOpen(false);
              onSwitchProfile();
            }}
            className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3 4 7l4 4" /><path d="M4 7h12a4 4 0 0 1 4 4v0" />
              <path d="m16 21 4-4-4-4" /><path d="M20 17H8a4 4 0 0 1-4-4v0" />
            </svg>
            {t("profiles.switch")}
          </button>

          <div className="my-1 h-px bg-line" />
          {links.map(([path, label]) => (
            <button
              key={path}
              data-nav
              onClick={() => go(path)}
              className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-ink-dim transition-colors hover:bg-surface-hover hover:text-ink"
            >
              {t(label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopNav({
  onSwitchProfile,
}: {
  onSettingsChanged: () => void;
  onSwitchProfile: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  // Content scrolls inside per-page containers; capture phase catches their
  // scroll events at the document level so the bar can react app-wide.
  useEffect(() => {
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      const top = target?.scrollTop ?? 0;
      setScrolled(top > 28);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  return (
    <header
      className={cx(
        "absolute inset-x-0 top-0 z-40 transition-colors duration-300",
        scrolled
          ? "border-b border-line/70 bg-bg/85 backdrop-blur-xl"
          : "border-b border-transparent bg-gradient-to-b from-black/70 to-transparent",
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4 md:gap-6 md:px-7">
        <button
          data-nav
          onClick={() => navigate("/")}
          className="flex items-center gap-2"
          aria-label="Fable TV"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm font-black">
            F
          </span>
          <span className="font-display hidden text-[19px] font-extrabold tracking-cine text-ink sm:inline">
            Fable<span className="text-ink-faint font-semibold">TV</span>
          </span>
        </button>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {PRIMARY.map((key) => (
            <NavLink
              key={key}
              to={PATHS[key]}
              end={key === "home"}
              data-nav
              className={({ isActive }) =>
                cx(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "text-ink" : "text-ink-dim hover:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <span className="relative">
                  {t(`nav.${key}`)}
                  {isActive && (
                    <span className="absolute -bottom-1.5 left-0 right-0 mx-auto h-[3px] w-5 rounded-full bg-brand" />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <NavLink
            to="/search"
            data-nav
            aria-label={t("nav.search")}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-dim transition-colors hover:bg-white/10 hover:text-ink"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </NavLink>
          <ProfileMenu onSwitchProfile={onSwitchProfile} />
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const { t } = useI18n();
  const items = ["home", "live", "movies", "series", "search"] as const;
  const icons: Record<string, ReactNodeIcon> = {
    home: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5V21H3z" />
      </svg>
    ),
    live: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="m8 2 4 4 4-4" fill="none" />
      </svg>
    ),
    movies: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 4v5M16 4v5" />
      </svg>
    ),
    series: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
    search: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-bg/90 backdrop-blur-xl md:hidden">
      {items.map((key) => (
        <NavLink
          key={key}
          to={PATHS[key]}
          end={key === "home"}
          data-nav
          className={({ isActive }) =>
            cx(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
              isActive ? "text-accent-strong" : "text-ink-dim",
            )
          }
        >
          {({ isActive }) => (
            <>
              {icons[key](isActive)}
              {t(`nav.${key}`)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

type ReactNodeIcon = (active: boolean) => ReactNode;
