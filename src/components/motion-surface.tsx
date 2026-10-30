import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export function MotionSurface({ children, className = "", delay = 0, layout = false }: { children: ReactNode; className?: string; delay?: number; layout?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const element = ref.current;
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const box = element.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width, y = (e.clientY - box.top) / box.height;
      element.style.setProperty("--tilt-x", `${(0.5 - y) * 7}deg`);
      element.style.setProperty("--tilt-y", `${(x - 0.5) * 9}deg`);
      element.style.setProperty("--pointer-x", `${x * 100}%`);
      element.style.setProperty("--pointer-y", `${y * 100}%`);
    };
    const leave = () => { element.style.setProperty("--tilt-x", "0deg"); element.style.setProperty("--tilt-y", "0deg"); };
    element.addEventListener("pointermove", move); element.addEventListener("pointerleave", leave);
    return () => { element.removeEventListener("pointermove", move); element.removeEventListener("pointerleave", leave); };
  }, []);
  return <motion.div ref={ref} layout={layout && !reduced ? "position" : false} initial={reduced ? false : { opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -15 }} viewport={{ once: true, amount: 0.08 }} transition={{ duration: reduced ? 0 : 0.55, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1], layout: { type: "spring", stiffness: 260, damping: 28 } }} className={`motion-surface ${className}`}>{children}</motion.div>;
}

export function MotionReveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return <motion.div initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: reduced ? 0 : 0.65, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }} className={className}>{children}</motion.div>;
}