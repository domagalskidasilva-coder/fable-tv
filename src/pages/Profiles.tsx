import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/Chrome";
import { PlaylistManager } from "../components/PlaylistManager";
import { ProfileModal } from "../components/ProfileModal";
import { Avatar } from "../lib/avatars";
import { Button, Confirm, Spinner } from "../components/ui";
import { deleteProfile, listProfiles, setActiveProfile } from "../lib/api";
import { EASE, gsap, useGsap } from "../lib/gsap";
import { useI18n } from "../lib/i18n";
import type { Profile } from "../lib/types";
import { cx } from "../lib/utils";
import { motion } from "framer-motion";
import { Pencil, Trash2, Users } from "lucide-react";

export default function Profiles({ onProfileChanged }: { onProfileChanged?: () => void }) {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);

  const load = useCallback(() => {
    listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);
  useEffect(load, [load]);

  const active = profiles?.find((p) => p.active) ?? null;

  const switchTo = async (id: number) => {
    await setActiveProfile(id).catch(() => undefined);
    load();
    onProfileChanged?.();
  };

  const gridRef = useGsap<HTMLDivElement>(
    (self) => {
      gsap.from(self.querySelectorAll("[data-reveal]"), {
        autoAlpha: 0,
        y: 18,
        stagger: 0.05,
        duration: 0.45,
        ease: EASE.out,
      });
    },
    [profiles ? profiles.length : 0],
  );

  return (
    <div className="h-full overflow-y-auto px-6 pt-6 md:px-10">
      <PageHeader title={t("profiles.title")} icon={<ProfilesIcon />}>
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + {t("profiles.new")}
        </Button>
      </PageHeader>
      <p className="-mt-2 mb-6 max-w-2xl text-sm leading-relaxed text-ink-dim">{t("profiles.subtitle")}</p>

      {profiles === null ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <div ref={gridRef} className="mb-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {profiles.map((p) => (
              <motion.div
                whileHover={{ scale: 1.04, y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                key={p.id}
                data-reveal
                className={cx(
                  "group relative flex flex-col items-center rounded-3xl border p-6 text-center shadow-lg backdrop-blur-xl transition-[border-color,box-shadow]",
                  p.active 
                    ? "border-accent/50 bg-accent-soft/40 shadow-[0_12px_40px_-12px_var(--accent-glow)]" 
                    : "border-border-soft bg-surface/50 hover:border-accent/40 hover:bg-surface hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]",
                )}
              >
                <button
                  data-nav
                  onClick={() => switchTo(p.id)}
                  className="flex w-full flex-col items-center focus:outline-none"
                >
                  <Avatar
                    image={p.image}
                    color={p.color}
                    name={p.name}
                    className={cx(
                      "mb-4 h-24 w-24 rounded-full shadow-2xl transition-transform duration-300 group-hover:scale-105",
                      p.active && "ring-4 ring-accent ring-offset-4 ring-offset-bg"
                    )}
                    textClassName="text-4xl font-bold"
                  />
                  <span className="w-full truncate font-bold text-white text-lg">{p.name}</span>
                  <span className="mt-1 text-xs font-medium text-ink-dim">
                    {t("profiles.counts", { c: p.channelCount, m: p.movieCount, s: p.seriesCount })}
                  </span>
                </button>
                <div className="mt-5 flex items-center justify-center gap-3">
                  {p.active ? (
                    <span className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-black text-white shadow-md">
                      {t("profiles.active")}
                    </span>
                  ) : (
                    <button
                      data-nav
                      onClick={() => switchTo(p.id)}
                      className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-white/20"
                    >
                      {t("profiles.switchTo")}
                    </button>
                  )}
                  <button
                    data-nav
                    aria-label={t("common.edit")}
                    onClick={() => {
                      setEditing(p);
                      setModalOpen(true);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-full text-ink-dim transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Pencil size={15} strokeWidth={2.5} />
                  </button>
                  {profiles.length > 1 && (
                    <button
                      data-nav
                      aria-label={t("common.delete")}
                      onClick={() => setDeleting(p)}
                      className="grid h-8 w-8 place-items-center rounded-full text-ink-dim transition-colors hover:bg-danger/20 hover:text-danger"
                    >
                      <Trash2 size={16} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {active && (
            <div className="border-t border-line pt-8">
              <PlaylistManager key={active.id} profileId={active.id} onChanged={load} />
            </div>
          )}
        </>
      )}

      <ProfileModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          load();
          onProfileChanged?.();
        }}
      />
      <Confirm
        open={deleting !== null}
        message={t("profiles.deleteConfirm")}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            deleteProfile(deleting.id)
              .then(() => {
                load();
                onProfileChanged?.();
              })
              .catch(() => undefined);
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}

function ProfilesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}
