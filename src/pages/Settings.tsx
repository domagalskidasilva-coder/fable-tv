import { useCallback, useEffect, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Button, Confirm, Field, inputClass, Toggle } from "../components/ui";
import {
  clearCache,
  createProfile,
  deleteProfile,
  exportData,
  getAppStats,
  getSettings,
  importData,
  listProfiles,
  setActiveProfile,
  setSetting,
} from "../lib/api";
import { useI18n, type Language } from "../lib/i18n";
import type { AppStats, Profile, Settings as SettingsMap } from "../lib/types";
import { cx, errorMessage, formatBytes } from "../lib/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-ink-dim">{title}</h2>
      {children}
    </section>
  );
}

export default function Settings({
  onSettingsChanged,
}: {
  onSettingsChanged: () => void;
}) {
  const { t } = useI18n();
  const [settings, setSettingsState] = useState<SettingsMap>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [newProfile, setNewProfile] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const load = useCallback(() => {
    getSettings().then(setSettingsState).catch(() => undefined);
    listProfiles().then(setProfiles).catch(() => undefined);
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
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl pb-12">
        <h1 className="mb-6 text-xl font-extrabold text-ink">{t("settings.title")}</h1>

        {notice && (
          <button
            data-nav
            onClick={() => setNotice(null)}
            className="mb-4 w-full rounded-xl bg-accent-soft px-4 py-3 text-left text-sm font-medium text-accent-strong"
          >
            {notice}
          </button>
        )}

        <Section title={t("settings.appearance")}>
          <Field label={t("settings.theme")}>
            <div className="flex gap-2">
              {(["dark", "light"] as const).map((th) => (
                <button
                  key={th}
                  data-nav
                  onClick={() => update("theme", th)}
                  className={cx(
                    "rounded-xl px-4 py-2 text-sm font-semibold",
                    (settings.theme ?? "dark") === th
                      ? "bg-accent text-white"
                      : "bg-bg-elevated text-ink-dim hover:text-ink",
                  )}
                >
                  {t(`settings.theme.${th}`)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("settings.language")}>
            <div className="flex gap-2">
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
                    "rounded-xl px-4 py-2 text-sm font-semibold",
                    (settings.language ?? "pt-BR") === code
                      ? "bg-accent text-white"
                      : "bg-bg-elevated text-ink-dim hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Section title={t("settings.behavior")}>
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
              className={cx(inputClass, "w-28")}
              value={settings.epg_days ?? "2"}
              onChange={(e) => update("epg_days", e.target.value)}
            />
          </Field>
        </Section>

        <Section title={t("settings.player")}>
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

        <Section title={t("settings.profiles")}>
          <div className="mb-3 flex flex-wrap gap-2">
            {profiles.map((p) => (
              <span
                key={p.id}
                className={cx(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                  p.active
                    ? "border-accent bg-accent-soft font-semibold text-accent-strong"
                    : "border-line bg-bg-elevated text-ink-dim",
                )}
              >
                <button
                  data-nav
                  onClick={() =>
                    setActiveProfile(p.id)
                      .then(() => {
                        load();
                        onSettingsChanged();
                      })
                      .catch(() => undefined)
                  }
                >
                  {p.name}
                </button>
                {profiles.length > 1 && (
                  <button
                    data-nav
                    aria-label={t("common.delete")}
                    onClick={() =>
                      deleteProfile(p.id)
                        .then(load)
                        .catch((e) => setNotice(errorMessage(e)))
                    }
                    className="text-ink-dim hover:text-danger"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              data-nav
              className={cx(inputClass, "max-w-xs")}
              placeholder={t("settings.newProfile")}
              value={newProfile}
              onChange={(e) => setNewProfile(e.target.value)}
            />
            <Button
              variant="ghost"
              disabled={!newProfile.trim()}
              onClick={() =>
                createProfile(newProfile.trim())
                  .then(() => {
                    setNewProfile("");
                    load();
                  })
                  .catch((e) => setNotice(errorMessage(e)))
              }
            >
              {t("common.add")}
            </Button>
          </div>
        </Section>

        <Section title={t("settings.data")}>
          {stats && (
            <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-ink-dim sm:grid-cols-3">
              <span>
                {t("settings.stats.db")}: <strong>{formatBytes(stats.dbSizeBytes)}</strong>
              </span>
              <span>
                {t("settings.stats.logos")}: <strong>{formatBytes(stats.logoCacheBytes)}</strong>
              </span>
              <span>
                {t("settings.stats.channels")}: <strong>{stats.channelCount.toLocaleString()}</strong>
              </span>
              <span>
                {t("settings.stats.movies")}: <strong>{stats.movieCount.toLocaleString()}</strong>
              </span>
              <span>
                {t("settings.stats.series")}: <strong>{stats.seriesCount.toLocaleString()}</strong>
              </span>
              <span>
                {t("settings.stats.episodes")}: <strong>{stats.episodeCount.toLocaleString()}</strong>
              </span>
              <span>
                {t("settings.stats.epg")}: <strong>{stats.epgCount.toLocaleString()}</strong>
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
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
