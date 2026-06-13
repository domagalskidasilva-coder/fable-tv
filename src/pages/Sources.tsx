import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { SourceModal } from "../components/SourceModal";
import { Button, Confirm, EmptyState, Spinner } from "../components/ui";
import {
  cancelSync,
  deleteSource,
  listActiveJobs,
  listSources,
  onSyncProgress,
  startSync,
} from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { Source, SyncOptions, SyncProgress } from "../lib/types";
import { formatDateTime } from "../lib/utils";

export default function Sources() {
  const { t, lang } = useI18n();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState<Source | null>(null);
  // sourceId -> latest progress event for the running job
  const [jobs, setJobs] = useState<Record<number, SyncProgress>>({});

  const load = useCallback(() => {
    listSources().then(setSources).catch(() => setSources([]));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    // Pick up jobs that were already running when the page opened.
    listActiveJobs()
      .then((active) => {
        setJobs((prev) => {
          const next = { ...prev };
          for (const j of active) {
            next[j.sourceId] ??= {
              jobId: j.jobId,
              sourceId: j.sourceId,
              phase: "download",
              processed: 0,
              total: null,
              message: null,
              finished: false,
            };
          }
          return next;
        });
      })
      .catch(() => undefined);

    let unlisten: (() => void) | undefined;
    onSyncProgress((p) => {
      setJobs((prev) => {
        const next = { ...prev };
        if (p.finished) {
          delete next[p.sourceId];
        } else {
          next[p.sourceId] = p;
        }
        return next;
      });
      if (p.finished) load();
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [load]);

  const sync = (source: Source, opts?: Partial<SyncOptions>) => {
    const options: SyncOptions = {
      channels: source.syncChannels,
      movies: source.syncMovies,
      series: source.syncSeries,
      epg: source.syncEpg,
      logos: source.syncLogos,
      ...opts,
    };
    startSync(source.id, options).catch(() => undefined);
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink">{t("sources.title")}</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + {t("sources.add")}
        </Button>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-ink-dim">{t("sources.subtitle")}</p>

      <div className="flex-1 overflow-y-auto">
        {sources === null ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : sources.length === 0 ? (
          <EmptyState
            title={t("sources.empty")}
            subtitle={t("sources.legal")}
            icon="📥"
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                {t("sources.add")}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 pb-10 lg:grid-cols-2">
            {sources.map((s) => {
              const job = jobs[s.id];
              const pct =
                job?.total && job.total > 0
                  ? Math.min(100, Math.round((job.processed / job.total) * 100))
                  : null;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-line bg-surface p-5 shadow-md"
                >
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-bold text-ink">{s.name}</h3>
                      <p className="text-xs text-ink-dim">{t(`sources.kind.${s.kind}`)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          setEditing(s);
                          setModalOpen(true);
                        }}
                      >
                        {t("common.edit")}
                      </Button>
                      <Button
                        variant="danger"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => setDeleting(s)}
                      >
                        {t("common.delete")}
                      </Button>
                    </div>
                  </div>

                  <p className="mb-1 mt-3 text-sm text-ink-dim">
                    {t("sources.counts", {
                      c: s.channelCount,
                      m: s.movieCount,
                      s: s.seriesCount,
                    })}
                    {s.epgCount > 0 && ` · EPG ${s.epgCount}`}
                  </p>
                  <p className="text-xs text-ink-dim/80">
                    {t("sources.lastSync")}:{" "}
                    {s.lastSyncAt ? formatDateTime(s.lastSyncAt, lang) : t("common.never")}
                    {s.lastSyncStatus ? ` — ${s.lastSyncStatus}` : ""}
                  </p>

                  {job ? (
                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold text-accent-strong">
                          {t(`sync.${job.phase}`)}
                          {pct !== null && ` · ${pct}%`}
                          {pct === null && job.processed > 0 && ` · ${job.processed.toLocaleString()}`}
                        </span>
                        <button
                          data-nav
                          onClick={() => cancelSync(job.jobId)}
                          className="font-semibold text-danger hover:underline"
                        >
                          {t("sources.cancelSync")}
                        </button>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded bg-line">
                        <div
                          className={pct === null ? "h-full w-1/3 animate-pulse bg-accent" : "h-full bg-accent"}
                          style={pct !== null ? { width: `${pct}%` } : undefined}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="soft" className="px-3 py-1.5 text-xs" onClick={() => sync(s)}>
                        {t("sources.syncNow")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-xs"
                        onClick={() =>
                          sync(s, { channels: true, movies: false, series: false, epg: false, logos: false })
                        }
                      >
                        {t("sources.sync.channels")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-xs"
                        onClick={() =>
                          sync(s, { channels: false, movies: true, series: false, epg: false, logos: false })
                        }
                      >
                        {t("sources.sync.movies")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-xs"
                        onClick={() =>
                          sync(s, { channels: false, movies: false, series: true, epg: false, logos: false })
                        }
                      >
                        {t("sources.sync.series")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-xs"
                        onClick={() =>
                          sync(s, { channels: false, movies: false, series: false, epg: true, logos: false })
                        }
                      >
                        {t("sources.sync.epg")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-xs"
                        onClick={() =>
                          sync(s, { channels: false, movies: false, series: false, epg: false, logos: true })
                        }
                      >
                        {t("sources.sync.logos")}
                      </Button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <SourceModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
      <Confirm
        open={deleting !== null}
        message={t("sources.deleteConfirm")}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            deleteSource(deleting.id).then(load).catch(() => undefined);
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
