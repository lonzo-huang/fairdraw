import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useSponsorRanking } from "@/hooks/use-sponsor-ranking";
import type { RankPeriod } from "@/lib/campaign-hub";
import type { SponsorRank } from "@/lib/sponsor-ranking";
import testAvatar from "@/assets/mirrortek-avatar.jpg.asset.json";

export function RankingAvatar({ row }: { row: SponsorRank }) {
  const [failed, setFailed] = useState(false);
  const src = row.handle?.toLowerCase() === "mirrortekuk" ? testAvatar.url : `https://unavatar.io/x/${row.handle}`;
  return row.handle && !failed ? <img src={src} alt="" onError={() => setFailed(true)} loading="lazy" className="sponsor-avatar size-8 shrink-0 object-cover" /> : <span className="sponsor-avatar size-8 shrink-0 text-xs">{row.name.charAt(0)}</span>;
}
export function RankMode({ sample, onChange }: { sample: boolean; onChange: (sample: boolean) => void }) {
  const { t } = useI18n();
  return <div className="flex gap-1" role="group" aria-label={t("rank.title")}><Button size="sm" variant={sample ? "glass" : "ghost"} onClick={() => onChange(true)} aria-pressed={sample}>{t("rank.test")}</Button><Button size="sm" variant={!sample ? "glass" : "ghost"} onClick={() => onChange(false)} aria-pressed={!sample}>{t("rank.real")}</Button></div>;
}
export function SponsorBoard({ period, currency, sample }: { period: RankPeriod; currency: string; sample: boolean }) {
  const { t } = useI18n();
  const { rows, pending, error } = useSponsorRanking(period, currency, sample);
  return <article className="rank-panel overflow-hidden rounded-lg border border-border">
    <header className="flex items-center justify-between border-b border-border px-4 py-3"><h4 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="size-4 text-prize" />{t(`cy.${period}`)}</h4><span className="font-mono text-[9px] text-prize">{sample && <span className="mr-2">{t("rank.test")}</span>}{currency}</span></header>
    <div className="ranking-rows">{pending || error ? <p className="px-4 py-12 text-center text-xs text-muted-foreground">{t(error ? "cy.loadError" : "cy.loading")}</p> : rows.length ? <ol>{rows.slice(0, 6).map((row, i) => <li key={row.id} className="rank-row"><span className={`font-mono text-xs ${i < 3 ? "text-prize" : "text-muted-foreground"}`}>{i + 1}</span><a href={row.handle ? `https://x.com/${row.handle}` : undefined} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2"><RankingAvatar row={row} /><span className="min-w-0"><span className="block truncate text-xs font-medium">{row.name}</span><span className="block truncate text-[9px] text-muted-foreground">{row.handle ? `@${row.handle}` : "—"}</span></span></a><span className="rank-amount text-right font-mono text-xs font-semibold text-prize">{row.amount.toLocaleString()}</span></li>)}</ol> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{t("cy.rankEmpty")}</div>}</div>
    <Button asChild variant="ghost" size="sm" className="w-full rounded-none border-t border-border text-primary"><Link to="/rankings" search={{ period, currency, mode: sample ? "sample" : "live" }}>{t("cy.fullRanking")}<ArrowUpRight className="size-3" /></Link></Button>
  </article>;
}