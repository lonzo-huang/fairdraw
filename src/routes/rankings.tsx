import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Trophy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RankingAvatar } from "@/components/sponsor-rankings";
import { useSponsorRanking } from "@/hooks/use-sponsor-ranking";
import { hubHostsQuery, impactSnapsQuery, publicHubQuery } from "@/lib/hub-queries";
import { useI18n } from "@/lib/i18n";
import { i18nLinks } from "@/lib/seo";
import type { RankPeriod } from "@/lib/campaign-hub";
import type { ImpactMetric, ImpactRow } from "@/lib/sponsor-ranking";

export const Route = createFileRoute("/rankings")({
  validateSearch: (search: Record<string, unknown>): { period: RankPeriod; metric: ImpactMetric } => ({
    period: search["period"] === "week" || search["period"] === "day" ? search["period"] : "month",
    metric: search["metric"] === "reach" || search["metric"] === "engagement" || search["metric"] === "growth" ? search["metric"] : "score",
  }),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(publicHubQuery),
    context.queryClient.ensureQueryData(impactSnapsQuery),
    context.queryClient.ensureQueryData(hubHostsQuery),
  ]),
  head: () => ({
    meta: [
      { title: "FairDraw 社区影响力榜单 — Top 50" },
      { name: "description", content: "按触达、互动与关注增长加权的影响力评分排名，月榜、周榜、日榜可切换指标。" },
      { property: "og:title", content: "FairDraw 社区影响力榜单 — Top 50" },
      { property: "og:description", content: "触达 40% · 互动 35% · 增长 25% — 分位数加权的影响力评分。" },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/rankings"),
  }),
  component: Rankings,
});
export function Rankings() {
  const { t, lp } = useI18n();
  const search = useSearch({ strict: false }) as { period?: "day" | "week" | "month"; metric?: "reach" | "engagement" | "growth" | "score" }, navigate = useNavigate();
  const { rows, pending, error } = useSponsorRanking(search.period ?? "month", search.metric ?? "score");
  const [campRow, setCampRow] = useState<ImpactRow | null>(null);
  return <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
    <Button asChild variant="link" className="mb-5 px-0"><Link to={lp("/") as never} hash="hub-drawn"><ArrowLeft />{t("rank.back")}</Link></Button>
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-xs text-prize">FAIRDRAW / TOP 50</p><h1 className="mt-3 flex items-center gap-3 text-3xl font-semibold"><Trophy className="size-7 text-prize" />{t("rank.title")}</h1></div></div>
    <p className="mt-5 border-l-2 border-prize pl-3 text-xs leading-6 text-muted-foreground">{t("cy.rankNote")}</p>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3"><div className="flex gap-1">{(["month", "week", "day"] as const).map((period) => <Button key={period} variant={search.period === period ? "glass" : "ghost"} size="sm" aria-pressed={search.period === period} onClick={() => navigate({ search: { ...search, period } } as never)}>{t(`cy.${period}`)}</Button>)}</div><div className="flex flex-wrap items-center gap-1">{(["score", "reach", "engagement", "growth"] as const).map((m) => <Button key={m} variant={search.metric === m ? "glass" : "ghost"} size="sm" aria-pressed={search.metric === m} onClick={() => navigate({ search: { ...search, metric: m } } as never)}>{t(`rank.m.${m}`)}</Button>)}<span className="ml-2 hidden font-mono text-[10px] text-muted-foreground sm:block">{t("rank.limit")}</span></div></div>
    <p className="mt-3 text-[10px] text-muted-foreground/70">{t("rank.weights")}</p>
    {rows.length >= 10 && <div className="mt-4 overflow-x-auto"><table className="ranking-table w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th>{t("rank.position")}</th><th>{t("rank.account")}</th><th className={`text-right ${search.metric === "score" ? "text-prize" : ""}`}>{t("rank.score")}</th><th className={`text-right ${search.metric === "reach" ? "text-prize" : ""}`}>{t("rank.reach")}</th><th className={`text-right ${search.metric === "engagement" ? "text-prize" : ""}`}>{t("rank.eng")}</th><th className={`text-right ${search.metric === "growth" ? "text-prize" : ""}`}>{t("rank.growth2")}</th><th className="text-right">{t("rank.campaigns")}</th><th className="text-right">{t("rank.profile")}</th></tr></thead><tbody>{rows.map((row, i) => <tr key={row.id} className="border-b border-border/50"><td className={`font-mono ${i < 3 ? "text-prize" : "text-muted-foreground"}`}>{String(i + 1).padStart(2, "0")}</td><td><div className="flex items-center gap-3"><RankingAvatar row={row} /><div className="min-w-0"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.handle ? `@${row.handle}` : "—"}</p></div></div></td><td className="text-right font-mono font-semibold text-prize">{row.score.toFixed(1)}</td><td className="text-right font-mono text-muted-foreground">{row.reach === null ? "—" : row.reach.toLocaleString()}</td><td className="text-right font-mono text-muted-foreground">{row.engagement === null ? "—" : row.engagement.toLocaleString()}</td><td className="text-right font-mono text-muted-foreground">{row.growth === null ? "—" : `+${row.growth.toLocaleString()}`}</td><td className="text-right"><Button variant="ghost" size="sm" className="h-7 px-2 font-mono" onClick={() => setCampRow(row)} title={t("rank.campaigns")}>{row.campaigns}</Button></td><td className="text-right">{row.handle && <Button asChild variant="ghost" size="icon" title={t("rank.profile")}><a href={`https://x.com/${row.handle}`} target="_blank" rel="noopener noreferrer" aria-label={`${t("rank.profile")} @${row.handle}`}><ArrowUpRight className="size-4" /></a></Button>}</td></tr>)}</tbody></table></div>}
    {!rows.length && <p className="py-16 text-center text-sm text-muted-foreground">{t(error ? "cy.loadError" : pending ? "cy.loading" : "cy.rankEmpty")}</p>}
    {!pending && !error && rows.length > 0 && rows.length < 10 && <p className="py-16 text-center text-sm text-muted-foreground">{t("rank.tooFew")}</p>}
    {rows.length >= 10 && <p className="mt-5 font-mono text-[10px] text-muted-foreground">{t("rank.limit")} · {rows.length}/50</p>}
    <Dialog open={campRow !== null} onOpenChange={(open) => { if (!open) setCampRow(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("rank.campList")}</DialogTitle></DialogHeader>
        {campRow && (campRow.campList.length ? <ul className="divide-y divide-border">{campRow.campList.map((cmp) => <li key={cmp.slug}><Link to={lp(`/c/${cmp.slug}`) as never} className="group flex items-center justify-between gap-3 py-2.5 text-sm" onClick={() => setCampRow(null)}><span className="min-w-0 truncate group-hover:text-primary">{cmp.title}</span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" /></Link></li>)}</ul> : <p className="py-4 text-sm text-muted-foreground">{t("rank.noCamps")}</p>)}
      </DialogContent>
    </Dialog>
  </section>;
}