import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ArrowRight, Search } from "lucide-react";
import { publicHubQuery } from "@/lib/hub-queries";
import { i18nLinks } from "@/lib/seo";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * "查开奖" — paste a campaign ID/slug or a result/campaign link and jump to
 * the result page, where the winner list can be re-computed in the browser.
 */
export const Route = createFileRoute("/verify")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicHubQuery),
  head: () => ({
    meta: [
      { title: "查开奖 — FairDraw" },
      { name: "description", content: "输入活动编号或粘贴结果链接，重算 FairDraw 抽奖的中奖名单。" },
      { property: "og:title", content: "查开奖 — FairDraw" },
      { property: "og:type", content: "website" },
    ],
    links: i18nLinks("/verify"),
  }),
  component: VerifyPage,
});

/** Accept a bare slug or any /c|/r/<slug> link (both languages). */
function parseSlug(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/(?:^|\/)(?:c|r)\/([A-Za-z0-9_-]+)\/?$/) ?? s.match(/^([A-Za-z0-9_-]+)$/);
  return m?.[1] ?? null;
}

export function VerifyPage() {
  const { t, lp } = useI18n();
  const navigate = useNavigate();
  const campaigns = useSuspenseQuery(publicHubQuery);
  const [q, setQ] = useState("");
  const [err, setErr] = useState(false);
  const drawn = (campaigns.data ?? [])
    .filter((c) => c.status === "drawn" && c.slug)
    .sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at))
    .slice(0, 10);

  function go(e: FormEvent) {
    e.preventDefault();
    const slug = parseSlug(q);
    if (!slug) { setErr(true); return; }
    const c = (campaigns.data ?? []).find((x) => x.slug === slug);
    if (!c) { setErr(true); return; }
    setErr(false);
    navigate({ to: c.status === "drawn" ? lp(`/r/${slug}`) as never : lp(`/c/${slug}`) as never });
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-16 sm:px-8">
      <h1 className="text-3xl font-bold">{t("vf.title")}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("vf.sub")}</p>

      <form onSubmit={go} className="mt-6 flex gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setErr(false); }}
          placeholder={t("vf.placeholder")}
          aria-label={t("vf.placeholder")}
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
        />
        <Button type="submit" variant="neon" size="lg" className="h-11"><Search className="size-4" />{t("vf.go")}</Button>
      </form>
      {err && <p className="mt-2 text-sm text-destructive">{t("vf.notFound")}</p>}

      <h2 className="mt-12 text-sm font-semibold text-muted-foreground">{t("vf.recent")}</h2>
      <ul className="mt-3 divide-y divide-border/60 border-y border-border/60">
        {drawn.length ? drawn.map((c) => (
          <li key={c.id}>
            <Link to={lp(`/r/${c.slug}`) as never} className="group flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium group-hover:text-primary">{c.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {c.slug} · {new Date(c.ends_at).toLocaleDateString()}
                  {c.prize_amount !== null ? ` · ${c.prize_amount} ${c.currency}` : ""}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          </li>
        )) : <li className="py-6 text-sm text-muted-foreground">{t("vf.empty")}</li>}
      </ul>
    </div>
  );
}
