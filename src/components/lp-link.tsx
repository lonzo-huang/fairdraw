import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import type { ReactNode } from "react";

type Props = {
  /** Chinese canonical path (e.g. "/c/abc" or "/guide") — /en is prepended on English pages. */
  to: string;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
};

/**
 * Locale-aware internal link: keeps English visitors inside /en/* for the
 * dual-language public routes; identical to <Link> elsewhere. The computed
 * path is asserted — lp() only produces registered route paths.
 */
export function LpLink({ to, children, className, onClick }: Props) {
  const { lp } = useI18n();
  return (
    <Link to={lp(to) as never} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
