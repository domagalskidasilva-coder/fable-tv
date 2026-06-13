// GSAP animation layer. All motion in the app flows through these helpers so
// timing/easing stay consistent and every animation is auto-cleaned via
// gsap.context() on unmount.

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type DependencyList,
  type RefObject,
} from "react";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

/** House easings — tuned for a premium, slightly springy streaming feel. */
export const EASE = {
  out: "power3.out",
  inOut: "power2.inOut",
  soft: "power2.out",
  pop: "back.out(1.6)",
} as const;

gsap.defaults({ ease: EASE.out, duration: 0.6 });

/**
 * Runs `setup` inside a gsap.context scoped to the returned ref. The context
 * is reverted on unmount or when `deps` change, so animations never leak and
 * `gsap.from(...)` re-runs cleanly. Selector strings inside `setup` are scoped
 * to the element.
 */
export function useGsap<T extends HTMLElement = HTMLDivElement>(
  setup: (self: T) => void,
  deps: DependencyList = [],
): RefObject<T> {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => setup(el), el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/**
 * Page-enter animation: fades and lifts the container, then staggers any
 * descendant marked `[data-reveal]`. Use on the root of each route.
 */
export function usePageEnter(deps: DependencyList = []): RefObject<HTMLDivElement> {
  return useGsap<HTMLDivElement>((self) => {
    gsap.from(self, { autoAlpha: 0, y: 14, duration: 0.45, ease: EASE.soft });
    const reveals = self.querySelectorAll("[data-reveal]");
    if (reveals.length) {
      gsap.from(reveals, {
        autoAlpha: 0,
        y: 26,
        duration: 0.5,
        stagger: 0.06,
        delay: 0.05,
        ease: EASE.out,
      });
    }
  }, deps);
}

/**
 * Scroll-triggered reveal for the children of a container (each child marked
 * `[data-reveal]`). Rows on the home screen use this so sections animate in as
 * the user scrolls.
 */
export function useScrollReveal(deps: DependencyList = []): RefObject<HTMLDivElement> {
  return useGsap<HTMLDivElement>((self) => {
    const items = self.querySelectorAll("[data-reveal]");
    items.forEach((item) => {
      gsap.from(item, {
        autoAlpha: 0,
        y: 36,
        duration: 0.6,
        ease: EASE.out,
        scrollTrigger: {
          trigger: item,
          start: "top 92%",
          toggleActions: "play none none none",
        },
      });
    });
  }, deps);
}

/**
 * Mount/unmount with an exit animation. Keeps the node mounted until the exit
 * timeline finishes. `enter`/`exit` build a timeline on the given element.
 */
export function usePresence(
  open: boolean,
  enter: (el: HTMLElement) => gsap.core.Timeline | gsap.core.Tween,
  exit: (el: HTMLElement) => gsap.core.Timeline | gsap.core.Tween,
): { rendered: boolean; ref: RefObject<HTMLDivElement> } {
  const [rendered, setRendered] = useState(open);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open) setRendered(true);
  }, [open]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      const anim = enter(el);
      return () => {
        anim.kill();
      };
    }
    if (rendered) {
      const anim = exit(el);
      anim.eventCallback("onComplete", () => setRendered(false));
      return () => {
        anim.kill();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rendered]);

  return { rendered, ref };
}

/**
 * Smooth, performant hover scale/lift for cards. Returns handlers plus a ref.
 * Uses quickTo so rapid pointer moves don't queue tweens.
 */
export function useHoverLift<T extends HTMLElement = HTMLButtonElement>(opts?: {
  scale?: number;
  lift?: number;
}): {
  ref: RefObject<T>;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
} {
  const ref = useRef<T>(null);
  const scaleTo = useRef<gsap.QuickToFunc | null>(null);
  const yTo = useRef<gsap.QuickToFunc | null>(null);
  const scale = opts?.scale ?? 1.07;
  const lift = opts?.lift ?? -8;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    scaleTo.current = gsap.quickTo(el, "scale", { duration: 0.35, ease: EASE.out });
    yTo.current = gsap.quickTo(el, "y", { duration: 0.35, ease: EASE.out });
  }, []);

  const enter = useCallback(() => {
    scaleTo.current?.(scale);
    yTo.current?.(lift);
    if (ref.current) gsap.to(ref.current, { zIndex: 20, duration: 0 });
  }, [scale, lift]);

  const leave = useCallback(() => {
    scaleTo.current?.(1);
    yTo.current?.(0);
    if (ref.current) gsap.to(ref.current, { zIndex: 1, duration: 0, delay: 0.35 });
  }, []);

  return {
    ref,
    onPointerEnter: enter,
    onPointerLeave: leave,
    onFocus: enter,
    onBlur: leave,
  };
}

/** Animate horizontal scroll of a container by a fraction of its width. */
export function scrollRowBy(el: HTMLElement, direction: 1 | -1) {
  const amount = el.clientWidth * 0.82 * direction;
  gsap.to(el, {
    scrollTo: { x: el.scrollLeft + amount },
    duration: 0.6,
    ease: EASE.inOut,
  });
}

export { gsap, ScrollTrigger };
