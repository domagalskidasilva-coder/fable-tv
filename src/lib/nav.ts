// Spatial navigation for keyboard arrows and remote-control D-pads.
// Any element with `data-nav` participates; arrows move focus to the best
// candidate in the pressed direction, Enter activates (native behavior).

type Dir = "up" | "down" | "left" | "right";

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function isTextTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

function candidates(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-nav]")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function pickBest(from: DOMRect, dir: Dir, items: HTMLElement[]): HTMLElement | null {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const dx = ex - cx;
    const dy = ey - cy;
    let primary: number;
    let ortho: number;
    switch (dir) {
      case "up":
        if (dy >= -4) continue;
        primary = -dy;
        ortho = Math.abs(dx);
        break;
      case "down":
        if (dy <= 4) continue;
        primary = dy;
        ortho = Math.abs(dx);
        break;
      case "left":
        if (dx >= -4) continue;
        primary = -dx;
        ortho = Math.abs(dy);
        break;
      case "right":
        if (dx <= 4) continue;
        primary = dx;
        ortho = Math.abs(dy);
        break;
    }
    const score = primary + ortho * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** Installs the global handler. Returns a cleanup function. */
export function initSpatialNav(goBack: () => void): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;

    // Back: Escape always; Backspace only outside text fields.
    if (e.key === "Escape" || (e.key === "Backspace" && !isTextTarget(active))) {
      // Let modals/players handle Escape themselves when they mark it.
      if (!document.body.hasAttribute("data-modal-open")) {
        e.preventDefault();
        goBack();
      }
      return;
    }

    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    if (isTextTarget(active)) return;
    if (active?.tagName === "VIDEO" || active?.closest("[data-player]")) return;
    if (active?.getAttribute("role") === "slider" || active?.tagName === "INPUT") return;

    const items = candidates();
    if (items.length === 0) return;

    const current = active && active.hasAttribute("data-nav") ? active : null;
    if (!current) {
      e.preventDefault();
      items[0].focus();
      return;
    }
    const target = pickBest(current.getBoundingClientRect(), dir, items);
    if (target) {
      e.preventDefault();
      target.focus();
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
