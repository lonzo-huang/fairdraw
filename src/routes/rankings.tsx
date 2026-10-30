import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RankMode, RankingAvatar } from "@/components/sponsor-rankings";
import { useSponsorRanking } from "@/hooks/use-sponsor-ranking";
import { useI18n } from "@/lib/i18n";
import type { RankPeriod } from "@/lib/campaign-hub";

export const Route = createFileRoute("/rankings")({
  validateSearch: (search: Record<string, unknown>): { period: RankPeriod; currency: string; mode: "sample" | "live" } => ({
    period: search["period"] === "week" || search["period"] === "day" ? search["period"] : "month",
    currency: typeof search["currency"] === "string" && ["CNY", "USD", "USDT", "EUR", "GBP"].includes(search["currency"]) ? search["currency"] : "USDT",
    mode: search["mode"] === "live" ? "live" : "sample",
  }),
  head: () => ({ meta: [
    { title: "FairDraw 发奖方榜单 — Top 50" },
    { name: "description", content: "查看 FairDraw 月、周、日发奖方 Top 50 榜单，真实记录与测试展示独立标注。" },
    { property: "og:title", content: "FairDraw 发奖方榜单 — Top 50" },
    { property: "og:description", content: "月榜、周榜、日榜：按已开奖声明奖池查看发奖方排名。" },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Rankings,
});
function Rankings() {
  const { t } = useI18n();
  const search = Route.useSearch(), navigate = Route.useNavigate();
  const sample = search.mode === "sample";
  const { rows, pending, error } = useSponsorRanking(search.period, search.currency, sample);
  return <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
    <Button asChild variant="link" className="mb-5 px-0"><Link to="/" hash="hub-drawn"><ArrowLeft />{t("rank.back")}</Link></Button>
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-xs text-prize">FAIRDRAW / TOP 50</p><h1 className="mt-3 flex items-center gap-3 text-3xl font-semibold"><Trophy className="size-7 text-prize" />{t("rank.title")}</h1></div><RankMode sample={sample} onChange={(value) => navigate({ search: { ...search, mode: value ? "sample" : "live" } })} /></div>
    <p className="mt-5 border-l-2 border-prize pl-3 text-xs leading-6 text-muted-foreground">{t(sample ? "rank.testNote" : "cy.rankNote")}</p>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3"><div className="flex gap-1">{(["month", "week", "day"] as const).map((period) => <Button key={period} variant={search.period === period ? "glass" : "ghost"} size="sm" aria-pressed={search.period === period} onClick={() => navigate({ search: { ...search, period } })}>{t(`cy.${period}`)}</Button>)}</div><div className="flex items-center gap-3"><span className="hidden font-mono text-[10px] text-muted-foreground sm:block">{t("rank.limit")}</span><select aria-label={t("f.currency")} value={search.currency} onChange={(e) => navigate({ search: { ...search, currency: e.target.value } })} className="rounded-md border border-border bg-card px-3 py-2 text-xs">{["CNY", "USD", "USDT", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select></div></div>
    <div className="mt-4 overflow-x-auto"><table className="ranking-table w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th>{t("rank.position")}</th><th>{t("rank.account")}</th><th className="text-right">{t("rank.amount")} / {search.currency}</th><th className="text-right">{t("rank.count")}</th><th className="text-right">{t("rank.profile")}</th></tr></thead><tbody>{rows.map((row, i) => <tr key={row.id} className="border-b border-border/50"><td className={`font-mono ${i < 3 ? "text-prize" : "text-muted-foreground"}`}>{String(i + 1).padStart(2, "0")}</td><td><div className="flex items-center gap-3"><RankingAvatar row={row} /><div className="min-w-0"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.handle ? `@${row.handle}` : "—"}</p></div></div></td><td className="text-right font-mono font-semibold text-prize">{row.amount.toLocaleString()}</td><td className="text-right font-mono text-muted-foreground">{row.count}</td><td className="text-right">{row.handle && <Button asChild variant="ghost" size="icon" title={t("rank.profile")}><a href={`https://x.com/${row.handle}`} target="_blank" rel="noopener noreferrer" aria-label={`${t("rank.profile")} @${row.handle}`}><ArrowUpRight className="size-4" /></a></Button>}</td></tr>)}</tbody></table></div>
    {!rows.length && <p className="py-16 text-center text-sm text-muted-foreground">{t(error ? "cy.loadError" : pending ? "cy.loading" : "cy.rankEmpty")}</p>}
    <p className="mt-5 font-mono text-[10px] text-muted-foreground">{t("rank.limit")} · {rows.length}/50</p>
  </section>;
}