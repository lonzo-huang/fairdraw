import type { Lang } from "@/lib/i18n";

export const SITE = "https://www.fairdraw.win";

/** "/guide" -> "/en/guide", "/" -> "/en". Input is always the Chinese path. */
export const enUrl = (zhPath: string) => (zhPath === "/" ? "/en" : `/en${zhPath}`);

/** Strip the /en prefix back to the canonical Chinese path. */
export const zhUrl = (path: string) =>
  path === "/en" || path.startsWith("/en/") ? path.slice(3) || "/" : path;

/**
 * Static public pages that exist in both languages, plus the dynamic
 * prefixes (/c/, /r/, /faq/payment/). Everything else (dashboard, auth,
 * claim) is single-language and keeps the stored preference.
 */
const DUAL_STATICS = ["/guide", "/archive", "/rankings", "/about", "/terms", "/privacy", "/contact", "/affiliate"];
export const isDualPath = (path: string) => {
  const z = zhUrl(path);
  return z === "/" || DUAL_STATICS.includes(z) || z.startsWith("/c/") || z.startsWith("/r/") || z === "/faq/payment" || z.startsWith("/faq/payment/");
};

/**
 * canonical (self) + hreflang alternate pair + x-default.
 * `zhPath` is the canonical path without the /en prefix.
 */
export function i18nLinks(zhPath: string, self: Lang = "zh") {
  const en = enUrl(zhPath);
  return [
    { rel: "canonical", href: `${SITE}${self === "en" ? en : zhPath}` },
    { rel: "alternate", hrefLang: "zh-CN", href: `${SITE}${zhPath}` },
    { rel: "alternate", hrefLang: "en", href: `${SITE}${en}` },
    { rel: "alternate", hrefLang: "x-default", href: `${SITE}${zhPath}` },
  ];
}
