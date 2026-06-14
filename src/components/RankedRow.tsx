import { useRef } from "react";
import type { MediaCard } from "../lib/types";
import { scrollRowBy, useHoverLift } from "../lib/gsap";
import { CardImage } from "./Cards";
import { Chevron, PlayIcon } from "./ui";

function RankedCard({
  card,
  rank,
  onOpen,
}: {
  card: MediaCard;
  rank: number;
  onOpen: (c: MediaCard) => void;
}) {
  const hover = useHoverLift<HTMLDivElement>({ scale: 1.06, lift: -6 });
  return (
    <button
      data-nav
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onFocus={hover.onFocus}
      onBlur={hover.onBlur}
      onClick={() => onOpen(card)}
      title={card.name}
      className="group/rank relative flex h-44 w-[228px] shrink-0 items-end text-left md:h-52 md:w-[268px]"
    >
      <span
        aria-hidden
        className="font-display pointer-events-none absolute bottom-[-0.08em] left-0 select-none font-black leading-[0.7] tracking-tighter"
        style={{
          fontSize: "clamp(120px, 14vw, 188px)",
          color: "var(--surface)",
          WebkitTextStroke: "2px rgba(255,255,255,0.22)",
        }}
      >
        {rank}
      </span>

      <div
        ref={hover.ref}
        className="relative z-10 ml-auto aspect-[2/3] h-full origin-bottom-right overflow-hidden rounded-md border border-line/60 bg-surface shadow-lg transition-[box-shadow,border-color] duration-300 group-hover/rank:border-accent/40 group-hover/rank:shadow-[0_24px_50px_-20px_rgba(0,0,0,0.8)]"
      >
        <CardImage src={card.image} alt={card.name} className="h-full w-full" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-300 group-hover/rank:opacity-100 group-focus-within/rank:opacity-100">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-black shadow-xl">
            <PlayIcon />
          </span>
        </div>
      </div>
    </button>
  );
}

/** Netflix-style "Top 10" row: oversized rank numerals beside each poster. */
export function RankedRow({
  title,
  cards,
  onOpen,
}: {
  title: string;
  cards: MediaCard[];
  onOpen: (c: MediaCard) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    if (scroller.current) scrollRowBy(scroller.current, dir);
  };

  return (
    <section data-reveal className="group/row mb-9">
      <h2 className="mb-3 px-1 text-lg font-bold tracking-tight text-ink">{title}</h2>
      <div className="relative">
        <button
          tabIndex={-1}
          aria-label="scroll left"
          onClick={() => scroll(-1)}
          className="absolute -left-2 top-0 bottom-2 z-20 hidden w-12 place-items-center rounded-2xl bg-gradient-to-r from-bg/90 to-transparent text-ink opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 md:grid"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/60 backdrop-blur transition-transform hover:scale-110">
            <Chevron dir="left" />
          </span>
        </button>

        <div
          ref={scroller}
          className="hide-scrollbar row-mask flex gap-3 overflow-x-auto overflow-y-hidden scroll-smooth px-1 py-4 pr-6"
        >
          {cards.slice(0, 10).map((card, i) => (
            <RankedCard key={`${card.itemType}-${card.id}`} card={card} rank={i + 1} onOpen={onOpen} />
          ))}
        </div>

        <button
          tabIndex={-1}
          aria-label="scroll right"
          onClick={() => scroll(1)}
          className="absolute -right-2 top-0 bottom-2 z-20 hidden w-12 place-items-center rounded-2xl bg-gradient-to-l from-bg/90 to-transparent text-ink opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 md:grid"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/60 backdrop-blur transition-transform hover:scale-110">
            <Chevron dir="right" />
          </span>
        </button>
      </div>
    </section>
  );
}
