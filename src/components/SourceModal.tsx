import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { addSource, testSource, updateSource } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { NewSource, Source, SourceKind } from "../lib/types";
import { errorMessage } from "../lib/utils";
import { Button, Field, inputClass, Modal, Toggle } from "./ui";

const EMPTY: NewSource = {
  name: "",
  kind: "m3u_url",
  url: "",
  username: null,
  password: null,
  epgUrl: null,
  syncChannels: true,
  syncMovies: true,
  syncSeries: true,
  syncEpg: false,
  syncLogos: false,
};

export function SourceModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Source | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<NewSource>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    if (editing) {
      setForm({
        name: editing.name,
        kind: editing.kind,
        url: editing.url,
        username: editing.username,
        password: null,
        epgUrl: editing.epgUrl,
        syncChannels: editing.syncChannels,
        syncMovies: editing.syncMovies,
        syncSeries: editing.syncSeries,
        syncEpg: editing.syncEpg,
        syncLogos: editing.syncLogos,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, editing]);

  const patch = (p: Partial<NewSource>) => setForm((f) => ({ ...f, ...p }));

  const pickFile = async () => {
    const file = await openDialog({
      multiple: false,
      filters: [{ name: "M3U", extensions: ["m3u", "m3u8", "txt"] }],
    });
    if (typeof file === "string") patch({ url: file });
  };

  const doTest = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const msg = await testSource(form);
      setFeedback({ ok: true, text: msg });
    } catch (e) {
      setFeedback({ ok: false, text: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      if (editing) {
        await updateSource(editing.id, form);
      } else {
        await addSource(form);
      }
      onSaved();
      onClose();
    } catch (e) {
      setFeedback({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const kinds: SourceKind[] = ["m3u_url", "m3u_file", "xc_api"];

  return (
    <Modal open={open} onClose={onClose} title={editing ? t("sources.edit") : t("sources.add")} wide>
      <div className="grid gap-x-6 md:grid-cols-2">
        <div>
          <Field label={t("sources.name")}>
            <input
              data-nav
              className={inputClass}
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Minha lista"
            />
          </Field>

          <Field label={t("sources.kind")}>
            <div className="flex flex-col gap-1.5">
              {kinds.map((k) => (
                <button
                  key={k}
                  data-nav
                  type="button"
                  onClick={() => patch({ kind: k, url: "" })}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    form.kind === k
                      ? "border-accent bg-accent-soft text-accent-strong"
                      : "border-line bg-surface text-ink-dim hover:bg-surface-hover"
                  }`}
                >
                  {t(`sources.kind.${k}`)}
                </button>
              ))}
            </div>
          </Field>

          {form.kind === "m3u_file" ? (
            <Field label={t("sources.file")}>
              <div className="flex gap-2">
                <input
                  data-nav
                  className={inputClass}
                  value={form.url}
                  onChange={(e) => patch({ url: e.target.value })}
                  placeholder="C:\\listas\\canais.m3u"
                />
                <Button variant="ghost" onClick={pickFile}>
                  {t("sources.chooseFile")}
                </Button>
              </div>
            </Field>
          ) : (
            <Field label={form.kind === "xc_api" ? t("sources.serverUrl") : t("sources.url")}>
              <input
                data-nav
                className={inputClass}
                value={form.url}
                onChange={(e) => patch({ url: e.target.value })}
                placeholder={
                  form.kind === "xc_api" ? "http://servidor.exemplo:8080" : "https://exemplo.com/lista.m3u"
                }
              />
            </Field>
          )}

          {form.kind === "xc_api" && (
            <>
              <Field label={t("sources.username")}>
                <input
                  data-nav
                  className={inputClass}
                  value={form.username ?? ""}
                  onChange={(e) => patch({ username: e.target.value || null })}
                  autoComplete="off"
                />
              </Field>
              <Field label={t("sources.password")}>
                <input
                  data-nav
                  type="password"
                  className={inputClass}
                  value={form.password ?? ""}
                  onChange={(e) => patch({ password: e.target.value || null })}
                  placeholder={editing ? t("sources.passwordKeep") : ""}
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}

          <Field label={t("sources.epgUrl")}>
            <input
              data-nav
              className={inputClass}
              value={form.epgUrl ?? ""}
              onChange={(e) => patch({ epgUrl: e.target.value || null })}
              placeholder="https://exemplo.com/epg.xml"
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-dim">
            {t("sources.whatToSync")}
          </p>
          <div className="rounded-xl border border-line bg-surface p-2">
            <Toggle
              checked={form.syncChannels}
              onChange={(v) => patch({ syncChannels: v })}
              label={t("sources.sync.channels")}
            />
            <Toggle
              checked={form.syncMovies}
              onChange={(v) => patch({ syncMovies: v })}
              label={t("sources.sync.movies")}
            />
            <Toggle
              checked={form.syncSeries}
              onChange={(v) => patch({ syncSeries: v })}
              label={t("sources.sync.series")}
            />
            <Toggle
              checked={form.syncEpg}
              onChange={(v) => patch({ syncEpg: v })}
              label={t("sources.sync.epg")}
            />
            <Toggle
              checked={form.syncLogos}
              onChange={(v) => patch({ syncLogos: v })}
              label={t("sources.sync.logos")}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-dim">{t("sources.legal")}</p>

          {feedback && (
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
                feedback.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
              }`}
            >
              {feedback.text}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
        <Button variant="ghost" onClick={doTest} disabled={testing || !form.url}>
          {testing ? t("sources.testing") : t("sources.test")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={busy || !form.url || !form.name.trim()}>
          {t("common.save")}
        </Button>
      </div>
    </Modal>
  );
}
