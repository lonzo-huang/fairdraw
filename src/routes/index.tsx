import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, Code2, Crown, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { todayLeader, xHandleFromUrl } from "@/lib/campaign-hub";
import { usePublicHub } from "@/hooks/use-public-hub";
import { Button } from "@/components/ui/button";
import { DrawScene } from "@/components/draw-scene";
import { xDisplayName } from "@/lib/sponsor-ranking";
import { CampaignHub } from "@/components/campaign-hub";
import { LiveTicker } from "@/components/live-ticker";
import { MotionReveal } from "@/components/motion-surface";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "FairDraw — 让每一次抽奖，都带来增长。" },
    { name: "description", content: "设定互动门槛与奖池托管，用可复核的公平抽奖，加速你的账号曝光与粉丝裂变。" },
    { property: "og:title", content: "FairDraw — 让每一次抽奖，都带来增长。" },
    { property: "og:description", content: "设定互动门槛与奖池托管，用可复核的公平抽奖，加速你的账号曝光与粉丝裂变。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Index,
});

function Index() {
  const { t } = useI18n();
  const campaigns = usePublicHub();
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const leader = todayLeader(campaigns.data ?? [], now);
  const leaderHandle = xHandleFromUrl(leader?.tweet_url);
  const handle = leaderHandle ?? "MirrortekUK";
  const displayName = xDisplayName(handle);
  const avatar = `https://unavatar.io/x/${handle}`;
  return <>
    <LiveTicker />
    <section className="cyber-hero border-b border-border">
      <DrawScene handle={handle} avatarUrl={avatar} />
      <MotionReveal className="hero-copy mx-auto px-5 pt-24 sm:px-8">
        <p className="flex items-center gap-2 font-mono text-[10px] text-success"><span className="live-dot" />{t("cy.eyebrow")}</p>
        <h1 className="hero-brand mt-6">FairDraw<span className="text-success">.</span></h1>
        <p className="hero-type mt-4 whitespace-pre-line font-semibold">{t("cy.headline")}</p>
        <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">{t("cy.sub")}</p>
        <div className="mt-7 flex flex-wrap gap-3"><Button asChild variant="neon" size="lg" className="hero-cta"><Link to="/new"><Zap />{t("cy.start")}<ArrowUpRight /></Link></Button><Button asChild variant="glass" size="lg" className="h-12"><Link to="/guide"><Code2 />{t("nav.guide")}</Link></Button></div>
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