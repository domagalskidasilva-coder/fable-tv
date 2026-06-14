import { useRef, type ReactNode } from "react";
import { scrollRowBy } from "../lib/gsap";
import { Chevron } from "./ui";

/** Horizontal scrolling section with a title and hover chevron controls. */
export function Row({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    if (scroller.current) scrollRowBy(scroller.current, dir);
  };

  return (
    <section data-reveal className="group/row mb-9">
      <div className="mb-3 flex items-baseline gap-3 px-1">
        <h2 className="text-base font-bold tracking-tight text-ink md:text-lg">{title}</h2>
        {action && (
          <span className="-translate-x-2 opacity-0 transition-all duration-200 group-hover/row:translate-x-0 group-hover/row:opacity-100">
            {action}
          </span>
        )}
      </div>
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
          className="hide-scrollbar row-mask flex gap-4 overflow-x-auto overflow-y-hidden scroll-smooth px-1 py-4 pr-6"
        >
          {children}
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

export function RowItem({ children, width = "w-40" }: { children: ReactNode; width?: string }) {
  return <div className={`${width} shrink-0`}>{children}</div>;
}
