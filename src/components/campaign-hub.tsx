import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Clock3, Gift, Flame, Trophy, Zap, Users, RefreshCw, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type DictKey } from "@/lib/i18n";
import { filterHub, hostInitial, xHandleFromUrl, winnerHandles, type HubCampaign, type HubTab } from "@/lib/campaign-hub";
import { SponsorBoard, RankMode } from "@/components/sponsor-rankings";
import { usePublicHub } from "@/hooks/use-public-hub";
import { Button } from "@/components/ui/button";
import { MotionSurface, MotionReveal } from "@/components/motion-surface";
import { parseConditions, type Metrics } from "@/lib/conditions";
import { AnimatedNumber, AnimatedProgress } from "@/components/animated-value";
import logoAsset from "@/assets/fairdraw-logo.png.asset.json";
import testAvatar from "@/assets/mirrortek-avatar.jpg.asset.json";

const sections = [{ id: "drawn", key: "cy.drawn", icon: Trophy }, { id: "top", key: "cy.top", icon: Flame }, { id: "latest", key: "cy.latest", icon: Zap }, { id: "ending", key: "cy.ending", icon: Clock3 }] as const;
export function CampaignHub() {
  const { t } = useI18n();
  const [active, setActive] = useState<HubTab>("drawn");
  const [currency, setCurrency] = useState("USDT");
  const [now, setNow] = useState(0);
  const [sampleRanking, setSampleRanking] = useState(true);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const query = usePublicHub();
  const snapshots = useQuery({ queryKey: ["public-hub-progress"], queryFn: async () => {
    const { data, error } = await supabase.from("condition_snapshots").select("campaign_id,progress,fetched_at,metrics").order("fetched_at", { ascending: false });
    if (error) throw error; return data;
  }, refetchInterval: 15 * 60 * 1000 });
  const hosts = useQuery({ queryKey: ["public-hub-hosts"], queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id,display_name");
    if (error) throw error; return data;
  }, refetchInterval: 15 * 60 * 1000 });
  const draws = useQuery({ queryKey: ["public-hub-draws"], queryFn: async () => {
    const { data, error } = await supabase.from("draws").select("campaign_id,winners,drawn_at");
    if (error) throw error; return data;
  }, refetchInterval: 15 * 60 * 1000 });
  const hostById = new Map((hosts.data ?? []).map((h) => [h.id, h.display_name]));
  const jump = (id: HubTab) => {
    setActive(id);
    document.getElementById(`hub-${id}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  };
  return <section id="campaigns" className="scroll-mt-24 py-9">
    <MotionReveal className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="flex items-center gap-2 font-mono text-[10px] text-success"><span className="live-dot" /> LIVE CAMPAIGN HUB</p><h2 className="mt-3 text-2xl font-semibold">{t("cy.hub")}</h2></div>
      <Button asChild variant="glass" size="sm"><Link to="/new"><Zap />{t("hero.cta")}</Link></Button>
    </MotionReveal>
    <nav aria-label={t("cy.hub")} className="hub-nav sticky top-16 z-20 mt-5 flex flex-wrap items-center justify-between gap-2 border-y border-border py-2">
      <div className="flex flex-wrap gap-1">{sections.map(({ id, key, icon: Icon }) => <Button key={id} variant={active === id ? "glass" : "ghost"} size="sm" onClick={() => jump(id)} aria-current={active === id ? "location" : undefined} className={active === id ? "text-prize" : "text-muted-foreground"}><Icon className="size-3.5" />{t(key)}</Button>)}</div>
      <div className="flex items-center gap-3"><select aria-label={t("f.currency")} value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1 text-xs">{["CNY", "USD", "USDT", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select><span className="hidden items-center gap-1 text-[9px] text-muted-foreground sm:flex"><RefreshCw className="size-3" />{t("cond.refresh")}</span></div>
    </nav>
    {sections.map(({ id, key, icon: Icon }, sectionIndex) => <section key={id} id={`hub-${id}`} className="hub-section scroll-mt-36 border-b border-border py-6">
      <div className="mb-4 flex items-center gap-2"><Icon className={`size-4 ${id === "drawn" || id === "top" ? "text-prize" : "text-primary"}`} /><h3 className="text-lg font-semibold">{t(key)}</h3><span className="ml-auto font-mono text-[10px] text-muted-foreground">0{sectionIndex + 1}</span></div>
      {id === "drawn" ? <><div className="mb-3"><RankMode sample={sampleRanking} onChange={setSampleRanking} /></div><div className="grid gap-3 lg:grid-cols-3">{(["month", "week", "day"] as const).map((period) => <SponsorBoard key={period} period={period} currency={currency} sample={sampleRanking} />)}</div><p className="mt-3 text-[10px] leading-5 text-muted-foreground">{t(sampleRanking ? "rank.testNote" : "cy.rankNote")}</p></> : query.isPending ? <div className="campaign-grid">{[0, 1, 2, 3, 4].map((n) => <div key={n} className="h-80 animate-pulse rounded-lg border border-border bg-card" />)}</div> : query.isError ? <div className="py-8 text-center text-xs">{t("cy.loadError")}<Button variant="link" onClick={() => query.refetch()}>{t("cy.retry")}</Button></div> : (() => {
        const campaigns = filterHub(query.data ?? [], id, now, currency);
        return campaigns.length ? <div className="campaign-grid">{campaigns.map((c, index) => {
          const snapshot = snapshots.data?.find((s) => s.campaign_id === c.id);
          return <CampaignCard key={c.id} c={c} now={now} index={index} hostName={hostById.get(c.owner_id)?.trim() || t("cy.host")} metrics={snapshot?.metrics as Partial<Metrics> | undefined} progress={snapshot?.progress} winners={winnerHandles(draws.data?.find((d) => d.campaign_id === c.id)?.winners)} />;
        })}</div> : <div className="flex items-center justify-center gap-3 py-7 text-xs text-muted-foreground"><Gift className="size-4 text-primary" />{t("cy.empty")}</div>;
      })()}
    </section>)}
    <p className="mt-4 text-[10px] text-muted-foreground">{t("cy.poolNote")}</p>
  </section>;
}
function CampaignCard({ c, now, index, hostName, metrics, progress, winners }: { c: HubCampaign; now: number; index: number; hostName: string; metrics: Partial<Metrics> | undefined; progress: number | undefined; winners: string[] }) {
  const { t } = useI18n();
  const seconds = Math.max(0, Math.floor((Date.parse(c.ends_at) - now) / 1000));
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((v) => String(v).padStart(2, "0")).join(":");
  const ending = c.status === "open" && seconds > 0 && seconds < 7200;
  const handle = xHandleFromUrl(c.tweet_url);
  const conds = parseConditions(c.conditions);
  const rows: { key: DictKey; cur: number | null; target: number }[] = [];
  if (conds.min_likes) rows.push({ key: "cond.likes", cur: metrics?.likes ?? null, target: conds.min_likes });
  if (conds.min_replies) rows.push({ key: "cond.replies", cur: metrics?.replies ?? null, target: conds.min_replies });
  if (conds.min_reposts) rows.push({ key: "cond.reposts", cur: metrics?.reposts ?? null, target: conds.min_reposts });
  if (conds.min_quotes) rows.push({ key: "cond.quotes", cur: metrics?.quotes ?? null, target: conds.min_quotes });
  if (conds.min_views) rows.push({ key: "cond.views", cur: metrics?.views ?? null, target: conds.min_views });
  if (conds.min_participants) rows.push({ key: "cond.participants", cur: metrics?.participants ?? null, target: conds.min_participants });
  if (conds.min_verified) rows.push({ key: "cond.verified", cur: metrics?.verified ?? null, target: conds.min_verified });
  return <MotionSurface delay={Math.min(index, 4) * 0.05}><article className={`campaign-tile cyber-panel compact-tile flex min-w-0 flex-col overflow-hidden rounded-lg border border-border ${ending ? "ending-soon" : ""}`}>
    <div className="relative isolate px-3 pt-3 pb-2">
      {handle && <CardBg src={avatarUrl(handle)} />}
      <p className="sponsor-title">{t("cy.sponsor")}</p>
      <SponsorLink handle={handle} className="mt-2 flex min-w-0 items-center justify-center gap-2"><Avatar handle={handle} name={hostName} size="md" /><span className="max-w-[65%] truncate text-[11px] font-semibold">@{handle ?? hostName}</span></SponsorLink>
      <h4 className="mt-2 truncate text-center text-xs font-semibold" title={c.title}>{c.title}</h4>
      <div className="mt-2 grid grid-cols-2 gap-1 text-center"><div><p className="font-mono text-[8px] text-muted-foreground">{t("cy.total")}</p><p className="truncate font-mono text-base font-semibold text-prize" title={`${c.prize_amount ?? c.prize} ${c.currency}`}>{c.prize_amount !== null ? <><AnimatedNumber value={c.prize_amount} decimals={c.prize_amount % 1 ? 2 : 0} /><span className="ml-1 text-[8px]">{c.currency}</span></> : <span className="text-[10px]">{c.prize}</span>}</p></div><div><p className="font-mono text-[8px] text-muted-foreground">{t("cy.places")}</p><p className="flex items-center justify-center gap-1 font-mono text-base"><Users className="size-3 text-muted-foreground" />{c.winners_count}</p></div></div>
    </div>
    <div className="relative isolate flex flex-1 flex-col px-3 pb-3">
      <CardBg src={winners[0] ? avatarUrl(winners[0]) : logoAsset.url} contain={!winners[0]} />
      <ul className="condition-slot rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[9px]">{conds.keyword && <li className="flex justify-between gap-1"><span className="text-muted-foreground">{t("cond.keyword")}</span><span className="truncate" title={conds.keyword}>{conds.keyword}</span></li>}{rows.length ? rows.map((r) => <li key={r.key} className="flex justify-between gap-1"><span className="text-muted-foreground">{t(r.key)}</span><span className={`font-mono ${r.cur !== null && r.cur >= r.target ? "text-success" : ""}`}>{r.cur ?? "—"}/{r.target}</span></li>) : !conds.keyword && <li className="text-muted-foreground">{t("cy.noConditions")}</li>}</ul>
      <div className="metric-duo mt-2 grid grid-cols-2 gap-1.5"><div className="exposure-box" title={t("cy.exposureNote")}><TrendingUp className="metric-signal" /><p className="text-[9px] text-muted-foreground">{t("cy.exposure")}</p><p className="font-mono text-xl font-bold text-prize"><AnimatedNumber value={c.clicks} /></p></div><div className="exposure-box" title={t("cy.popularityNote")}><span className="metric-signal live-dot" /><p className="text-[9px] text-muted-foreground">{t("cy.popularity")}</p><p className="font-mono text-xl font-bold text-success">—</p></div></div>
      <div className="mt-2 flex justify-between text-[9px] text-muted-foreground"><span>{t("cy.drawProgress")}</span><span className="font-mono">{progress === undefined ? "—" : `${progress}%`}</span></div><AnimatedProgress label={t("cy.drawProgress")} value={progress} tone="heat" />
      <div className="winner-slot mt-2 border-t border-border pt-2"><p className="sponsor-title">{t("cy.winnersTitle")}</p>{winners.length ? <ul className="mt-1 flex justify-center gap-1.5">{winners.slice(0, 3).map((h) => <li key={h}><SponsorLink handle={h} className="flex flex-col items-center gap-0.5"><Avatar handle={h} name={h} size="sm" /><span className="max-w-12 truncate text-[8px]">@{h}</span></SponsorLink></li>)}{winners.length > 3 && <li className="self-center text-[9px] text-muted-foreground">+{winners.length - 3}</li>}</ul> : <p className="mt-2 text-center text-[9px] text-muted-foreground">{t("cy.winnersPending")}</p>}</div>
      <div className="tile-actions mt-auto grid grid-cols-2 gap-1.5 pt-2"><Button asChild variant="glass" size="sm" className="h-7 px-1 text-[10px]"><Link to="/c/$slug" params={{ slug: c.slug }}>{t("cy.details")}</Link></Button>{c.tweet_url ? <Button asChild variant="neon" size="sm" className="h-7 gap-0.5 px-1 text-[10px]"><a href={c.tweet_url} target="_blank" rel="noopener noreferrer">{t("cy.postPage")}<ArrowUpRight className="size-3" /></a></Button> : <Button variant="glass" size="sm" className="h-7 px-1 text-[10px]" disabled>{t("cy.postPage")}</Button>}</div>
      <div className={`mt-2 flex items-center justify-center gap-1 border-t border-border pt-2 font-mono text-[9px] ${ending ? "text-success" : "text-muted-foreground"}`}><Clock3 className="size-3" />{t("cy.countdown")} {seconds ? time : t("cy.ended")}</div>
    </div>
  </article></MotionSurface>;
}
function SponsorLink({ handle, className, children }: { handle: string | null; className?: string; children: ReactNode }) {
  if (!handle) return <div className={className}>{children}</div>;
  return <a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer" className={`${className ?? ""} transition-opacity hover:opacity-80`}>{children}</a>;
}
function avatarUrl(handle: string) { return handle.toLowerCase() === "mirrortekuk" ? testAvatar.url : `https://unavatar.io/x/${handle}`; }
function Avatar({ handle, name, size }: { handle: string | null; name: string; size: "md" | "sm" }) {
  const [failed, setFailed] = useState(false);
  const cls = size === "md" ? "sponsor-avatar size-8 text-xs" : "sponsor-avatar size-6 text-[9px]";
  if (handle && !failed) return <img key={handle} src={avatarUrl(handle)} alt={`@${handle}`} loading="lazy" onError={() => setFailed(true)} className={`${cls} object-cover`} />;
  return <span className={cls} aria-hidden>{hostInitial(name)}</span>;
}
function CardBg({ src, contain = false }: { src: string; contain?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"><img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`size-full ${contain ? "object-contain p-4 opacity-[0.16]" : "object-cover opacity-[0.3] blur-[1px] scale-110"}`} /><div className="absolute inset-0 bg-gradient-to-b from-card/30 via-card/60 to-card/90" /></div>;
}
