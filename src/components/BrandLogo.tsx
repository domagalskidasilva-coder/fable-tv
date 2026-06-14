import fableTvMark from "../assets/brand/fable-tv-mark.png";
import { cx } from "../lib/utils";

const sizeClass = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-12 w-12 rounded-xl",
  lg: "h-16 w-16 rounded-2xl",
};

export function BrandMark({
  size = "sm",
  className,
}: {
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "block shrink-0 overflow-hidden bg-bg-elevated shadow-lg shadow-accent-soft",
        sizeClass[size],
        className,
      )}
      aria-hidden="true"
    >
      <img src={fableTvMark} alt="" draggable={false} className="h-full w-full object-cover" />
    </span>
  );
}
