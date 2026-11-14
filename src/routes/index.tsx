import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, Code2, Crown, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { todayLeader, xHandleFromUrl } from "@/lib/campaign-hub";
import { usePublicHub } from "@/hooks/use-public-hub";
import { hubDrawsQuery, hubHostsQuery, hubProgressQuery, publicHubQuery } from "@/lib/hub-queries";
import { i18nLinks } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { DrawScene } from "@/components/draw-scene";
import { CampaignHub } from "@/components/campaign-hub";
import { LiveTicker } from "@/components/live-ticker";
import { MotionReveal } from "@/components/motion-surface";

export const Route = createFileRoute("/")({
  // Prefetch everything the hub renders so SSR ships real cards, not skeletons.
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(publicHubQuery),
    context.queryClient.ensureQueryData(hubProgressQuery),
    context.queryClient.ensureQueryData(hubHostsQuery),
    context.queryClient.ensureQueryData(hubDrawsQuery),
  ]),
  head: () => ({
    meta: [
      { title: "FairDraw — X（推特）抽奖助手｜自动统计回复，公开抽中奖者" },
      { name: "description", content: "在 X 上办抽奖，粘贴推文链接即可：自动收集回复、剔除小号、到点抽出中奖者。名单公开，谁都能自己重算结果；奖金提前存好，不开奖全额退。" },
      { property: "og:title", content: "FairDraw · X 抽奖助手" },
      { property: "og:description", content: "粘贴一条推文链接，收回复、挑中奖者、发奖金全搞定。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/"),
  }),
  component: Index,
});

export function Index() {
  const { t, lp } = useI18n();
  const campaigns = usePublicHub();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const leader = todayLeader(campaigns.data ?? [], now);
  const leaderHandle = xHandleFromUrl(leader?.tweet_url);
  const handle = leaderHandle ?? "FairDraw";
  const displayName = handle;
  const avatar = `https://unavatar.io/x/${handle}`;
  return <>
    <LiveTicker />
    <section className="cyber-hero border-b border-border">
      <DrawScene handle={handle} avatarUrl={avatar} />
      <MotionReveal className="hero-copy mx-auto px-5 pt-24 sm:px-8">
        <p className="flex items-center gap-2 font-mono text-[10px] text-success"><span className="live-dot" />{t("cy.eyebrow")}</p>
        <h1 className="hero-brand mt-6">FairDraw<span className="text-success">.</span><span className="sr-only">{t("cy.h1Suffix")}</span></h1>
        <p className="hero-type mt-4 whitespace-pre-line font-semibold" role="doc-subtitle">{t("cy.headline")}</p>
        <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">{t("cy.sub")}</p>
        <div className="mt-7 flex flex-wrap gap-3"><Button asChild variant="neon" size="lg" className="hero-cta"><Link to="/new"><Zap />{t("cy.start")}<ArrowUpRight /></Link></Button><Button asChild variant="glass" size="lg" className="h-12"><Link to={lp("/verify") as never}><Code2 />{t("cy.how")}</Link></Button></div>
        <ul className="mt-9 max-w-md space-y-3 text-sm">
          {([1, 2, 3] as const).map((n) => (
            <li key={n} className="flex gap-3">
              <b className="shrink-0 font-semibold">{t(`cy.sell${n}t`)}</b>
              <span className="text-muted-foreground">{t(`cy.sell${n}d`)}</span>
            </li>
          ))}
        </ul>
      </MotionReveal>
       <a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer" className="hero-annotation">
         <p className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground"><span className="live-dot" /><Crown className="size-3.5 text-amber-400" />{t("cy.todayLeader")}</p>
         <div className="mt-3 flex items-center gap-3">
           <img src={avatar} alt={displayName} className="size-10 rounded-full border border-primary/40 object-cover shadow-glow" />
           <span><span className="block text-sm font-semibold leading-tight">{displayName}</span><span className="text-xs text-muted-foreground">@{handle}</span></span>
         </div>
         {leader?.prize_amount ? <p className="mt-3 border-t border-border/60 pt-2 font-mono text-[10px] text-success">{leader.prize_amount} {leader.currency} · {t("tick.top")}</p> : null}
       </a>
    </section>
    <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
      <CampaignHub />
    </div>
  </>;
}