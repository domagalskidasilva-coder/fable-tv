import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { BrandMark } from "./BrandLogo";
import { listProfiles } from "../lib/api";
import { Avatar } from "../lib/avatars";
import { useI18n } from "../lib/i18n";
import type { Profile } from "../lib/types";
import { cx } from "../lib/utils";
import { EASE, gsap, usePresence } from "../lib/gsap";
import { motion } from "framer-motion";
import { Home, Tv, Film, LayoutGrid, Search } from "lucide-react";

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
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        data-nav
        onClick={() => setOpen((v) => !v)}
        aria-label="perfil"
      >
        <Avatar
          image={active?.image}
          color={active?.color ?? "var(--accent)"}
          name={active?.name ?? "F"}
          className="h-10 w-10 rounded-full shadow-lg border-2 border-transparent transition-colors hover:border-accent"
          textClassName="text-sm font-bold"
        />
      </motion.button>

      {rendered && (
        <div
          ref={ref}
          className="absolute right-0 top-14 z-50 w-64 overflow-hidden rounded-2xl border border-border-soft bg-bg-elevated p-2 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]"
        >
          <div className="flex items-center gap-3 rounded-xl px-3 py-3">
            <Avatar
              image={active?.image}
              color={active?.color ?? "var(--accent)"}
              name={active?.name ?? "F"}
              className="h-10 w-10 rounded-full"
              textClassName="text-sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{active?.name ?? "Fable"}</p>
              <p className="text-[11px] font-medium text-ink-dim">{t("profiles.active")}</p>
            </div>
          </div>

          <button
            data-nav
            onClick={() => {
              setOpen(false);
              onSwitchProfile();
            }}
            className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:bg-surface-hover"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3 4 7l4 4" /><path d="M4 7h12a4 4 0 0 1 4 4v0" />
              <path d="m16 21 4-4-4-4" /><path d="M20 17H8a4 4 0 0 1-4-4v0" />
            </svg>
            {t("profiles.switch")}
          </button>

          <div className="my-1.5 h-px bg-border-soft" />
          {links.map(([path, label]) => (
            <button
              key={path}
              data-nav
              onClick={() => go(path)}
              className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-dim transition-colors hover:bg-surface-hover hover:text-white"
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

  useEffect(() => {
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      const top = target?.scrollTop ?? 0;
      setScrolled(top > 20);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  return (
    <header
      className={cx(
        "absolute inset-x-0 top-0 z-40 transition-all duration-500",
        scrolled
          ? "border-b border-border-soft bg-surface/50 backdrop-blur-2xl shadow-xl py-1"
          : "border-b border-transparent bg-transparent py-4",
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4 md:gap-8 md:px-10 max-w-[2000px] mx-auto">
        <button
          data-nav
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 transition-transform hover:scale-105 active:scale-95"
          aria-label="Fable TV"
        >
          <BrandMark />
          <span className="font-display hidden text-xl font-extrabold tracking-tight text-white sm:inline text-shadow-sm">
            Fable<span className="text-accent-strong font-bold">TV</span>
          </span>
        </button>

        <nav className="hidden flex-1 items-center gap-2 md:flex ml-4">
          {PRIMARY.map((key) => (
            <NavLink
              key={key}
              to={PATHS[key]}
              end={key === "home"}
              data-nav
              className={({ isActive }) =>
                cx(
                  "relative rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                  isActive ? "text-white" : "text-ink-dim hover:text-white hover:bg-surface-hover/50",
                )
              }
            >
              {({ isActive }) => (
                <span className="relative z-10">
                  {t(`nav.${key}`)}
                  {isActive && (
                    <motion.div
                      layoutId="top-nav-indicator"
                      className="absolute -bottom-2 left-0 right-0 mx-auto h-1 w-full rounded-t-lg bg-accent shadow-[0_-2px_12px_var(--accent-glow-strong)]"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4 md:ml-0">
          <NavLink
            to="/search"
            data-nav
            aria-label={t("nav.search")}
            className="grid h-10 w-10 place-items-center rounded-full text-ink-dim transition-all hover:bg-surface-hover hover:text-white"
          >
            <Search size={20} strokeWidth={2.5} />
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
    home: (a) => <Home size={22} strokeWidth={a ? 2.5 : 2} fill={a ? "currentColor" : "none"} />,
    live: (a) => <Tv size={22} strokeWidth={a ? 2.5 : 2} fill={a ? "currentColor" : "none"} />,
    movies: (a) => <Film size={22} strokeWidth={a ? 2.5 : 2} fill={a ? "currentColor" : "none"} />,
    series: (a) => <LayoutGrid size={22} strokeWidth={a ? 2.5 : 2} fill={a ? "currentColor" : "none"} />,
    search: (a) => <Search size={22} strokeWidth={a ? 2.5 : 2} />,
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border-soft bg-surface-2/80 backdrop-blur-3xl md:hidden pb-safe">
      {items.map((key) => (
        <NavLink
          key={key}
          to={PATHS[key]}
          end={key === "home"}
          data-nav
          className={({ isActive }) =>
            cx(
              "relative flex flex-1 flex-col items-center gap-1.5 py-3 text-[10px] font-bold transition-colors",
              isActive ? "text-accent-strong" : "text-ink-dim",
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute top-0 left-0 right-0 mx-auto h-[3px] w-8 rounded-b-full bg-accent shadow-[0_2px_8px_var(--accent-glow-strong)]"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
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
