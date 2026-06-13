import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Confirm, EmptyState, PlayIcon, Spinner } from "../components/ui";
import { clearHistory, deleteHistoryEntry, listHistory } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { HistoryEntry, ItemType } from "../lib/types";
import { cx, formatClock, formatDateTime, imageSrc, progressOf } from "../lib/utils";
import { openCard } from "./Home";

const TABS: Array<{ key: ItemType | "all"; label: string }> = [
  { key: "all", label: "common.all" },
  { key: "channel", label: "search.channels" },
  { key: "movie", label: "search.movies" },
  { key: "episode", label: "search.episodes" },
];

export default function History() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ItemType | "all">("all");
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    setEntries(null);
    listHistory(tab === "all" ? null : tab, 200, 0)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [tab]);

  useEffect(load, [load]);

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink">{t("history.title")}</h1>
        {entries && entries.length > 0 && (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t("history.clear")}
          </Button>
        )}
      </div>

      <div className="mb-5 flex gap-2">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            data-nav
            onClick={() => setTab(key)}
            className={cx(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              tab === key ? "bg-accent text-white" : "bg-surface text-ink-dim hover:bg-surface-hover",
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries === null ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState title={t("history.empty")} icon="🕘" />
        ) : (
          <div className="flex max-w-3xl flex-col gap-2 pb-10">
            {entries.map((entry) => {
              const { card } = entry;
              const img = imageSrc(card.image);
              const progress = progressOf(card.positionSecs, card.durationSecs);
              return (
                <div
                  key={`${card.itemType}-${card.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-3"
                >
                  <button
                    data-nav
                    onClick={() => openCard(navigate, card)}
                    className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  >
                    <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-hover">
                      {img && <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{card.name}</p>
                      <p className="text-xs text-ink-dim">
                        {formatDateTime(entry.updatedAt, lang)}
                        {entry.completed
                          ? ` · ${t("history.completed")}`
                          : card.positionSecs && card.positionSecs > 0
                            ? ` · ${formatClock(card.positionSecs)}`
                            : ""}
                      </p>
                      {progress !== null && !entry.completed && (
                        <div className="mt-1.5 h-1 max-w-[12rem] overflow-hidden rounded bg-line">
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${Math.round(progress * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-accent-soft p-2 text-accent-strong opacity-0 transition-opacity group-hover:opacity-100">
                      <PlayIcon size={14} />
                    </span>
                  </button>
                  <button
                    data-nav
                    aria-label={t("common.delete")}
                    onClick={() =>
                      deleteHistoryEntry(card.itemType, card.id).then(load).catch(() => undefined)
                    }
                    className="shrink-0 rounded-full p-2 text-ink-dim opacity-0 transition-opacity hover:bg-danger/15 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Confirm
        open={confirming}
        message={t("history.confirmClear")}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          clearHistory().then(load).catch(() => undefined);
        }}
      />
    </div>
  );
}
