import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listProfiles, setActiveProfile } from "../lib/api";
import { Avatar } from "../lib/avatars";
import { EASE, gsap, useGsap } from "../lib/gsap";
import { useI18n } from "../lib/i18n";
import type { Profile } from "../lib/types";
import { Spinner } from "../components/ui";

function ProfileTile({ profile, onPick }: { profile: Profile; onPick: () => void }) {
  return (
    <button
      data-nav
      data-reveal
      onClick={onPick}
      className="group flex w-32 flex-col items-center gap-3 md:w-40"
    >
      <Avatar
        image={profile.image}
        color={profile.color}
        name={profile.name}
        className="aspect-square w-full rounded-2xl shadow-lg ring-2 ring-transparent transition-all duration-200 group-hover:ring-ink group-focus-visible:ring-ink"
        textClassName="text-4xl md:text-5xl"
      />
      <span className="truncate text-sm font-medium text-ink-dim transition-colors group-hover:text-ink">
        {profile.name}
      </span>
    </button>
  );
}

export default function WhoIsWatching({ onEnter }: { onEnter: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);

  useEffect(() => {
    listProfiles().then(setProfiles).catch(() => setProfiles([]));
  }, []);

  const ref = useGsap<HTMLDivElement>(
    (self) => {
      gsap.from(self.querySelectorAll("[data-reveal]"), {
        autoAlpha: 0,
        y: 24,
        scale: 0.96,
        duration: 0.5,
        stagger: 0.07,
        ease: EASE.out,
      });
    },
    [profiles ? "ready" : "loading"],
  );

  const pick = async (id: number) => {
    await setActiveProfile(id).catch(() => undefined);
    onEnter();
    navigate("/");
  };

  const manage = () => {
    onEnter();
    navigate("/profiles");
  };

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden px-6">
      {profiles === null ? (
        <Spinner />
      ) : (
        <div ref={ref} className="flex flex-col items-center">
          <p data-reveal className="eyebrow mb-3">
            Fable
          </p>
          <h1
            data-reveal
            className="font-display mb-12 text-center text-4xl font-black tracking-cine text-ink md:text-5xl"
          >
            {t("who.title")}
          </h1>

          <div className="flex flex-wrap items-start justify-center gap-6 md:gap-9">
            {profiles.map((p) => (
              <ProfileTile key={p.id} profile={p} onPick={() => pick(p.id)} />
            ))}

            <button
              data-nav
              data-reveal
              onClick={manage}
              className="group flex w-32 flex-col items-center gap-3 md:w-40"
            >
              <span className="grid aspect-square w-full place-items-center rounded-2xl border-2 border-dashed border-line text-ink-faint transition-colors group-hover:border-ink group-hover:text-ink">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span className="text-sm font-medium text-ink-dim transition-colors group-hover:text-ink">
                {t("who.add")}
              </span>
            </button>
          </div>

          <button
            data-nav
            data-reveal
            onClick={manage}
            className="mt-14 rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-ink-dim transition-colors hover:border-ink/40 hover:text-ink"
          >
            {t("who.manage")}
          </button>
        </div>
      )}
    </div>
  );
}
