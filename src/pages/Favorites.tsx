import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChannelCard, PosterCard } from "../components/Cards";
import { Chip, PageHeader } from "../components/Chrome";
import { EmptyState, Spinner } from "../components/ui";
import { listFavorites } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { ItemType, MediaCard } from "../lib/types";
import { openCard } from "./Home";

const TABS: Array<{ key: ItemType | "all"; label: string }> = [
  { key: "all", label: "common.all" },
  { key: "channel", label: "search.channels" },
  { key: "movie", label: "search.movies" },
  { key: "series", label: "search.series" },
  { key: "episode", label: "search.episodes" },
];

export default function Favorites() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ItemType | "all">("all");
  const [items, setItems] = useState<MediaCard[] | null>(null);

  useEffect(() => {
    setItems(null);
    listFavorites(tab === "all" ? undefined : tab)
      .then(setItems)
      .catch(() => setItems([]));
  }, [tab]);

  return (
    <div className="flex h-full flex-col px-6 pt-6 md:px-10">
      <PageHeader title={t("favorites.title")} icon={<HeartIconLg />} />
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(({ key, label }) => (
          <Chip key={key} active={tab === key} onClick={() => setTab(key)}>
            {t(label)}
          </Chip>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items === null ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={t("favorites.empty")} icon="❤️" />
        ) : (
          <div className="grid grid-cols-2 gap-4 pb-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((card) =>
              card.itemType === "channel" || card.itemType === "episode" ? (
                <div key={`${card.itemType}-${card.id}`} className="col-span-2">
                  <ChannelCard card={card} onOpen={(c) => openCard(navigate, c)} />
                </div>
              ) : (
                <PosterCard
                  key={`${card.itemType}-${card.id}`}
                  card={card}
                  onOpen={(c) => openCard(navigate, c)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HeartIconLg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 21s-7.5-4.7-10-9.2C.6 8.4 2.3 4.5 6 4.1c2.1-.2 4 .9 6 3 2-2.1 3.9-3.2 6-3 3.7.4 5.4 4.3 4 7.7-2.5 4.5-10 9.2-10 9.2z" />
    </svg>
  );
}
