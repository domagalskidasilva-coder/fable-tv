import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Virtualized responsive grid for large catalogs (tens of thousands of
 * items). Renders only visible rows; calls `onEndReached` to page in more
 * data from the backend.
 */
export function VirtualGrid<T>({
  items,
  renderItem,
  minItemWidth,
  rowHeight,
  gap = 16,
  onEndReached,
  hasMore,
  header,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  minItemWidth: number;
  /** Row height as a function of the computed column width. */
  rowHeight: (colWidth: number) => number;
  gap?: number;
  onEndReached?: () => void;
  hasMore?: boolean;
  header?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setWidth(el.clientWidth));
    obs.observe(el);
    setWidth(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  const usable = Math.max(0, width - 8);
  const cols = Math.max(2, Math.floor((usable + gap) / (minItemWidth + gap)));
  const colWidth = cols > 0 ? (usable - gap * (cols - 1)) / cols : minItemWidth;
  const rows = Math.ceil(items.length / cols);
  const rowH = rowHeight(colWidth) + gap;

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 4,
  });

  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!onEndReached || !hasMore || rows === 0) return;
    const last = virtualRows[virtualRows.length - 1];
    if (last && last.index >= rows - 3) {
      onEndReached();
    }
  }, [virtualRows, rows, hasMore, onEndReached]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto pr-2">
      {header}
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((vRow) => {
          const start = vRow.index * cols;
          const rowItems = items.slice(start, start + cols);
          return (
            <div
              key={vRow.key}
              className="absolute left-0 top-0 grid w-full"
              style={{
                transform: `translateY(${vRow.start}px)`,
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap,
              }}
            >
              {rowItems.map((item, i) => (
                <div key={start + i}>{renderItem(item, start + i)}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
