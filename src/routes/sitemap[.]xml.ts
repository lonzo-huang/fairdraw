import { createFileRoute } from "@tanstack/react-router";
import { enUrl, SITE } from "@/lib/seo";

/**
 * Dynamic sitemap: bilingual static pages + public campaign (/c/) and
 * result (/r/) pages. Simulated campaigns are excluded — they carry
 * robots:noindex and must not enter the sitemap. The public anon client
 * is used so only rows visitors can actually read are listed.
 */
const STATIC_PATHS = [
  "/", "/guide", "/archive", "/rankings", "/about", "/terms", "/privacy",
  "/contact", "/affiliate", "/faq/payment", "/faq/payment/metamask",
  "/faq/payment/binance", "/faq/payment/okx",
] as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One <url> entry plus its reciprocal hreflang alternates. */
function urlEntry(zhPath: string, lastmod?: string) {
  const zh = `${SITE}${zhPath}`;
  const en = `${SITE}${enUrl(zhPath)}`;
  const alts =
    `<xhtml:link rel="alternate" hreflang="zh-CN" href="${esc(zh)}"/>` +
    `<xhtml:link rel="alternate" hreflang="en" href="${esc(en)}"/>` +
    `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(zh)}"/>`;
  const lm = lastmod ? `<lastmod>${lastmod}</lastmod>` : "";
  return `<url><loc>${esc(zh)}</loc>${lm}${alts}</url><url><loc>${esc(en)}</loc>${lm}${alts}</url>`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const paths = [...STATIC_PATHS];
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: campaigns, error } = await supabaseAdmin
            .from("campaigns")
            .select("slug, status, ends_at, is_simulated")
            .order("ends_at", { ascending: false })
            .limit(5000);
          if (error) throw error;
          for (const c of campaigns ?? []) {
            if (c.is_simulated || !c.slug) continue;
            paths.push(`/c/${c.slug}`);
            if (c.status === "drawn") paths.push(`/r/${c.slug}`);
          }
        } catch {
          // Sitemap still serves static pages if the DB read fails.
        }
        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">` +
          paths.map((p) => urlEntry(p)).join("") +
          `</urlset>`;
        return new Response(xml, {
          headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});
