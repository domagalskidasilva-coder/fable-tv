import { useEffect, useState } from "react";
import { createProfile, updateProfile } from "../lib/api";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(editing?.name ?? "");
    setColor(editing?.color ?? COLORS[0]);
  }, [open, editing]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateProfile(editing.id, { name, color });
        onSaved(editing.id);
      } else {
        const id = await createProfile({ name, color });
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
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-black text-bg"
          style={{ background: color }}
        >
          {(name.trim()[0] ?? "F").toUpperCase()}
        </div>
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
