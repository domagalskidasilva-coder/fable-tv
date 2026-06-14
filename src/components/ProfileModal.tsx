import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { createProfile, importProfileImage, updateProfile } from "../lib/api";
import { AVATAR_PRESETS, Avatar } from "../lib/avatars";
import { useI18n } from "../lib/i18n";
import type { Profile } from "../lib/types";
import { cx, errorMessage } from "../lib/utils";
import { Button, Field, inputClass, Modal } from "./ui";

const COLORS = [
  "#e8b65a", "#e0794b", "#d8556a", "#9b6cd6",
  "#5a8fe0", "#3fb4a6", "#69b85a", "#9aa0ad",
];

export function ProfileModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Profile | null;
  onClose: () => void;
  onSaved: (id?: number) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(editing?.name ?? "");
    setColor(editing?.color ?? COLORS[0]);
    setImage(editing?.image ?? null);
  }, [open, editing]);

  const upload = async () => {
    try {
      const file = await openDialog({
        multiple: false,
        filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      if (typeof file !== "string") return;
      const stored = await importProfileImage(file);
      setImage(stored);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateProfile(editing.id, { name, color, image });
        onSaved(editing.id);
      } else {
        const id = await createProfile({ name, color, image });
        onSaved(id);
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? t("profiles.edit") : t("profiles.new")}>
      <div className="mb-5 flex items-center gap-4">
        <Avatar
          image={image}
          color={color}
          name={name || "?"}
          className="h-16 w-16 shrink-0 rounded-2xl"
          textClassName="text-2xl"
        />
        <div className="flex-1">
          <Field label={t("profiles.name")}>
            <input
              data-nav
              autoFocus
              className={inputClass}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="Sala, Quarto, Crianças…"
            />
          </Field>
        </div>
      </div>

      <p className="eyebrow mb-2">{t("profiles.image")}</p>
      <div className="mb-3 flex flex-wrap gap-2.5">
        {AVATAR_PRESETS.map((p) => {
          const key = `preset:${p.id}`;
          return (
            <button
              key={p.id}
              data-nav
              aria-label={p.id}
              onClick={() => setImage(key)}
              className={cx(
                "rounded-xl transition-transform",
                image === key ? "ring-2 ring-ink ring-offset-2 ring-offset-bg-elevated" : "hover:scale-105",
              )}
            >
              <Avatar image={key} color={color} name="" className="h-11 w-11 rounded-xl" />
            </button>
          );
        })}
        <button
          data-nav
          onClick={upload}
          className={cx(
            "grid h-11 w-11 place-items-center rounded-xl border border-dashed border-line text-ink-faint transition-colors hover:border-ink hover:text-ink",
            image && !image.startsWith("preset:") && "border-accent text-accent-strong",
          )}
          aria-label={t("profiles.uploadImage")}
          title={t("profiles.uploadImage")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
        </button>
        {image && (
          <button
            data-nav
            onClick={() => setImage(null)}
            className="grid h-11 w-11 place-items-center rounded-xl border border-line text-ink-faint transition-colors hover:border-danger hover:text-danger"
            aria-label={t("common.delete")}
            title={t("common.delete")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <p className="eyebrow mb-2">{t("profiles.color")}</p>
      <div className="mb-6 flex flex-wrap gap-2.5">
        {COLORS.map((c) => (
          <button
            key={c}
            data-nav
            aria-label={c}
            onClick={() => setColor(c)}
            className={cx(
              "h-9 w-9 rounded-full transition-transform",
              color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-bg-elevated" : "hover:scale-110",
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={busy || !name.trim()}>
          {t("common.save")}
        </Button>
      </div>
    </Modal>
  );
}
