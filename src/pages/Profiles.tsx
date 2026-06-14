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
          <div ref={gridRef} className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {profiles.map((p) => (
              <div
                key={p.id}
                data-reveal
                className={cx(
                  "group relative flex flex-col items-center rounded-2xl border p-5 text-center transition-colors",
                  p.active ? "border-accent/60 bg-accent-soft" : "border-line bg-surface hover:bg-surface-hover",
                )}
              >
                <button
                  data-nav
                  onClick={() => switchTo(p.id)}
                  className="flex w-full flex-col items-center"
                >
                  <Avatar
                    image={p.image}
                    color={p.color}
                    name={p.name}
                    className="mb-3 h-20 w-20 rounded-2xl shadow-lg"
                    textClassName="text-3xl"
                  />
                  <span className="w-full truncate font-semibold text-ink">{p.name}</span>
                  <span className="mt-0.5 text-xs text-ink-dim">
                    {t("profiles.counts", { c: p.channelCount, m: p.movieCount, s: p.seriesCount })}
                  </span>
                </button>
                <div className="mt-3 flex items-center gap-2">
                  {p.active ? (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-bg">
                      {t("profiles.active")}
                    </span>
                  ) : (
                    <button
                      data-nav
                      onClick={() => switchTo(p.id)}
                      className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-white/[0.16]"
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
                    className="grid h-7 w-7 place-items-center rounded-full text-ink-dim hover:bg-white/10 hover:text-ink"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                  </button>
                  {profiles.length > 1 && (
                    <button
                      data-nav
                      aria-label={t("common.delete")}
                      onClick={() => setDeleting(p)}
                      className="grid h-7 w-7 place-items-center rounded-full text-ink-dim hover:bg-danger/15 hover:text-danger"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
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
        onSaved={load}
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
