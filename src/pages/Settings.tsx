import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Button, Confirm, Field, inputClass, Toggle } from "../components/ui";
import {
  checkForUpdate,
  clearCache,
  exportData,
  getAppStats,
  getSettings,
  importData,
  openUrl,
  setSetting,
} from "../lib/api";
import { useI18n, type Language } from "../lib/i18n";
import type { AppStats, Settings as SettingsMap, UpdateInfo } from "../lib/types";
import { cx, errorMessage, formatBytes } from "../lib/utils";

import { motion } from "framer-motion";

function Section({ title, children, delay }: { title: string; children: React.ReactNode; delay: number }) {
  return (
    <motion.section 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="mb-8 rounded-3xl border border-border-soft bg-surface/40 p-6 shadow-lg backdrop-blur-xl transition-[background-color,border-color] hover:bg-surface/60 hover:border-accent/30"
    >
      <h2 className="mb-5 text-sm font-bold uppercase tracking-widest text-accent-strong drop-shadow-sm">{title}</h2>
      {children}
    </motion.section>
  );
}

export default function Settings({
  onSettingsChanged,
}: {
  onSettingsChanged: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [settings, setSettingsState] = useState<SettingsMap>({});
  const [stats, setStats] = useState<AppStats | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateError, setUpdateError] = useState(false);

  const checkUpdate = async () => {
    setChecking(true);
    setUpdateError(false);
    setUpdateInfo(null);
    try {
      setUpdateInfo(await checkForUpdate());
    } catch {
      setUpdateError(true);
    } finally {
      setChecking(false);
    }
  };

  const load = useCallback(() => {
    getSettings().then(setSettingsState).catch(() => undefined);
    getAppStats().then(setStats).catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const update = async (key: string, value: string) => {
    setSettingsState((s) => ({ ...s, [key]: value }));
    try {
      await setSetting(key, value);
      onSettingsChanged();
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  const bool = (key: string, fallback = false) =>
    (settings[key] ?? String(fallback)) === "true";

  const doExport = async () => {
    try {
      const path = await saveDialog({
        defaultPath: "fable-tv-config.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await exportData(path);
      setNotice(t("settings.exportDone"));
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  const doImport = async () => {
    try {
      const file = await openDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof file !== "string") return;
      const report = await importData(file);
      setNotice(
        t("settings.importDone", {
          sources: report.sourcesAdded,
          favorites: report.favoritesMatched,
        }),
      );
      load();
      onSettingsChanged();
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 pt-6 md:px-10">
      <div className="mx-auto max-w-2xl pb-16">
        <h1 className="mb-6 text-3xl font-black tracking-tight text-ink md:text-4xl">
          {t("settings.title")}
        </h1>

        {notice && (
          <button
            data-nav
            onClick={() => setNotice(null)}
            className="mb-4 w-full rounded-xl bg-accent-soft px-4 py-3 text-left text-sm font-medium text-accent-strong"
          >
            {notice}
          </button>
        )}

        <Section title={t("settings.appearance")} delay={0.1}>
          <Field label={t("settings.theme")}>
            <div className="flex gap-3">
              {(["dark", "light"] as const).map((th) => (
                <button
                  key={th}
                  data-nav
                  onClick={() => update("theme", th)}
                  className={cx(
                    "rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-300",
                    (settings.theme ?? "dark") === th
                      ? "bg-accent text-white shadow-[0_0_12px_var(--accent-glow)] scale-105"
                      : "bg-surface-2 text-ink-dim hover:text-white hover:bg-surface-hover",
                  )}
                >
                  {t(`settings.theme.${th}`)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("settings.language")}>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["pt-BR", "Português (Brasil)"],
                  ["en", "English"],
                ] as Array<[Language, string]>
              ).map(([code, label]) => (
                <button
                  key={code}
                  data-nav
                  onClick={() => update("language", code)}
                  className={cx(
                    "rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-300",
                    (settings.language ?? "pt-BR") === code
                      ? "bg-accent text-white shadow-[0_0_12px_var(--accent-glow)] scale-105"
                      : "bg-surface-2 text-ink-dim hover:text-white hover:bg-surface-hover",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Section title={t("settings.behavior")} delay={0.2}>
          <Toggle
            checked={bool("lightweight")}
            onChange={(v) => update("lightweight", String(v))}
            label={t("settings.lightweight")}
            hint={t("settings.lightweightHint")}
          />
          <Field label={t("settings.epgDays")}>
            <input
              data-nav
              type="number"
              min={1}
              max={14}
              className={cx(inputClass, "w-32 bg-surface-2 font-bold text-center")}
              value={settings.epg_days ?? "2"}
              onChange={(e) => update("epg_days", e.target.value)}
            />
          </Field>
        </Section>

        <Section title={t("settings.player")} delay={0.3}>
          <Toggle
            checked={bool("player_autoplay_next", true)}
            onChange={(v) => update("player_autoplay_next", String(v))}
            label={t("settings.autoplayNext")}
          />
          <Toggle
            checked={bool("player_remember_position", true)}
            onChange={(v) => update("player_remember_position", String(v))}
            label={t("settings.rememberPosition")}
          />
          <Toggle
            checked={bool("history_enabled", true)}
            onChange={(v) => update("history_enabled", String(v))}
            label={t("settings.historyEnabled")}
          />
        </Section>

        <Section title={t("settings.profiles")} delay={0.4}>
          <p className="mb-4 text-sm leading-relaxed text-ink-dim font-medium">{t("profiles.subtitle")}</p>
          <Button variant="ghost" onClick={() => navigate("/profiles")}>
            {t("who.manage")}
          </Button>
        </Section>

        <Section title={t("settings.updates")} delay={0.45}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Fable TV</p>
              <p className="text-xs text-ink-dim">
                {t("settings.currentVersion")}: {updateInfo?.currentVersion ?? "0.1.0"}
              </p>
            </div>
            <Button variant="ghost" onClick={checkUpdate} disabled={checking}>
              {checking ? t("settings.checking") : t("settings.checkUpdates")}
            </Button>
          </div>

          {updateError && <p className="mt-3 text-sm text-danger">{t("settings.updateError")}</p>}

          {updateInfo && !updateError && (
            <div className="mt-3">
              {updateInfo.available ? (
                <div className="rounded-xl border border-accent/40 bg-accent-soft p-4">
                  <p className="mb-1 text-sm font-bold text-accent-strong">
                    {t("settings.updateAvailable", { v: updateInfo.latestVersion ?? "" })}
                  </p>
                  {updateInfo.notes && (
                    <p className="mb-3 line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-ink-dim">
                      {updateInfo.notes}
                    </p>
                  )}
                  {updateInfo.url && (
                    <Button onClick={() => openUrl(updateInfo.url!).catch(() => undefined)}>
                      {t("settings.download")} ↓
                    </Button>
                  )}
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-ok">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  {t("settings.upToDate")}
                </p>
              )}
            </div>
          )}
        </Section>

        <Section title={t("settings.data")} delay={0.55}>
          {stats && (
            <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-ink-dim sm:grid-cols-3 bg-surface-2/50 p-4 rounded-2xl border border-border-soft">
              <span className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-faint">{t("settings.stats.db")}</span>
                <strong className="text-white text-base">{formatBytes(stats.dbSizeBytes)}</strong>
              </span>
              <span className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-faint">{t("settings.stats.logos")}</span>
                <strong className="text-white text-base">{formatBytes(stats.logoCacheBytes)}</strong>
              </span>
              <span className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-faint">{t("settings.stats.channels")}</span>
                <strong className="text-white text-base">{stats.channelCount.toLocaleString()}</strong>
              </span>
              <span className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-faint">{t("settings.stats.movies")}</span>
                <strong className="text-white text-base">{stats.movieCount.toLocaleString()}</strong>
              </span>
              <span className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-faint">{t("settings.stats.series")}</span>
                <strong className="text-white text-base">{stats.seriesCount.toLocaleString()}</strong>
              </span>
              <span className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-faint">{t("settings.stats.episodes")}</span>
                <strong className="text-white text-base">{stats.episodeCount.toLocaleString()}</strong>
              </span>
              <span className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-faint">{t("settings.stats.epg")}</span>
                <strong className="text-white text-base">{stats.epgCount.toLocaleString()}</strong>
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={doExport}>
              {t("settings.export")}
            </Button>
            <Button variant="ghost" onClick={doImport}>
              {t("settings.import")}
            </Button>
            <Button variant="ghost" onClick={() => clearCache("logos").then(load).catch(() => undefined)}>
              {t("settings.clearLogos")}
            </Button>
            <Button variant="ghost" onClick={() => clearCache("epg").then(load).catch(() => undefined)}>
              {t("settings.clearEpg")}
            </Button>
            <Button variant="danger" onClick={() => setConfirmClearAll(true)}>
              {t("settings.clearAll")}
            </Button>
          </div>
        </Section>

        <p className="px-1 text-xs leading-relaxed text-ink-dim">{t("settings.privacy")}</p>
      </div>

      <Confirm
        open={confirmClearAll}
        message={t("settings.clearAllConfirm")}
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={() => {
          setConfirmClearAll(false);
          clearCache("all").then(load).catch((e) => setNotice(errorMessage(e)));
        }}
      />
    </div>
  );
}
