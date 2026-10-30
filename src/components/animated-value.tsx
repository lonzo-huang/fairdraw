import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(current.current, value, { duration: reduced ? 0 : 0.9, ease: "easeOut", onUpdate: (v) => { current.current = v; setDisplay(v); } });
    return () => controls.stop();
  }, [value, inView, reduced]);
  return <span ref={ref} className="tabular-nums">{display.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

export function AnimatedProgress({ value, label, tone = "default" }: { value: number | undefined; label: string; tone?: "default" | "heat" }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const [filled, setFilled] = useState(false);
  const target = value === undefined ? 0 : Math.min(100, Math.max(0, value));
  useEffect(() => {
    if (!inView) return;
    // Give the zero-width state a painted frame before starting the CSS transition.
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => setFilled(true)); });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame); };
  }, [inView]);
  return <div ref={ref} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === undefined ? undefined : target} className={`animated-progress ${tone === "heat" ? "animated-progress-heat" : ""} ${reduced ? "motion-off" : ""}`}>
    <span className="animated-progress-fill" style={{ width: `${filled ? target : 0}%` }} />
  </div>;
}