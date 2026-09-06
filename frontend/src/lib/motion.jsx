// IBVAP Sentinel — motion primitives.
// Small, dependency-free helpers for scroll-reveal and count-up animation.
// All of them no-op cleanly when prefers-reduced-motion is set.

import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * useReveal — returns a ref; the element fades/slides in once it enters the
 * viewport. Pair with the `.reveal` class in index.css.
 */
export function useReveal({ threshold = 0.15, once = true } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add("is-visible");
            if (once) io.unobserve(el);
          } else if (!once) {
            el.classList.remove("is-visible");
          }
        });
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  return ref;
}

/**
 * Reveal — wrapper that applies the scroll-in animation. `delay` staggers
 * children; `as` picks the element tag.
 */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div", ...rest }) {
  const ref = useReveal();
  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      style={{ "--reveal-delay": `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * useCountUp — animates a number from `from` to `value` once the returned ref
 * scrolls into view, with a mount-time safety so the value is never stuck at 0.
 * Returns [ref, displayValue].
 */
export function useCountUp(value, { duration = 1100, from = 0, decimals = 0 } = {}) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(from);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const run = () => {
      if (started.current) return;
      started.current = true;
      if (prefersReducedMotion()) {
        setDisplay(value);
        return;
      }
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        const current = from + (value - from) * eased;
        setDisplay(decimals ? Number(current.toFixed(decimals)) : Math.round(current));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const inView = () => {
      const r = el.getBoundingClientRect();
      return r.top < (window.innerHeight || 800) * 1.1 && r.bottom > 0;
    };
    if (inView()) run();

    let io;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && run()),
        { threshold: 0.25 }
      );
      io.observe(el);
    }
    const safety = setTimeout(run, 900);
    return () => {
      io && io.disconnect();
      clearTimeout(safety);
    };
  }, [value, duration, from, decimals]);

  return [ref, display];
}

/**
 * CountUp — drop-in animated number. Renders `prefix + n + suffix`.
 */
export function CountUp({ value, prefix = "", suffix = "", decimals = 0, duration = 1100, className = "" }) {
  const [ref, n] = useCountUp(value, { duration, decimals });
  return (
    <span ref={ref} className={className}>
      {prefix}
      {decimals ? n.toFixed(decimals) : n}
      {suffix}
    </span>
  );
}
