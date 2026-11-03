import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, Code2, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { todayLeader, xHandleFromUrl } from "@/lib/campaign-hub";
import { usePublicHub } from "@/hooks/use-public-hub";
import testAvatar from "@/assets/mirrortek-avatar.jpg.asset.json";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DrawScene } from "@/components/draw-scene";
import { xDisplayName } from "@/lib/sponsor-ranking";
import { CampaignHub } from "@/components/campaign-hub";
import { LiveTicker } from "@/components/live-ticker";
import { MotionReveal } from "@/components/motion-surface";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "FairDraw — 引爆全网增长，让中奖绝对透明" },
    { name: "description", content: "设定互动门槛与奖池托管，用可复核的公平抽奖，加速你的账号曝光与粉丝裂变。" },
    { property: "og:title", content: "FairDraw — 引爆全网增长，让中奖绝对透明" },
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
  const leader = todayLeader(campaigns.data ?? [], now, "USDT");
  const leaderHandle = xHandleFromUrl(leader?.tweet_url);
  const handle = leaderHandle ?? "MirrortekUK";
  const displayName = xDisplayName(handle);
  const avatar = handle.toLowerCase() === "mirrortekuk" ? testAvatar.url : `https://unavatar.io/x/${handle}`;
  return <>
    <LiveTicker />
    <section className="cyber-hero border-b border-border">
      <DrawScene handle={handle} avatarUrl={avatar} />
      <MotionReveal className="hero-copy mx-auto px-5 pt-24 sm:px-8">
        <p className="flex items-center gap-2 font-mono text-[10px] text-success"><span className="live-dot" />{t("cy.eyebrow")}</p>
        <h1 className="hero-brand mt-6">FairDraw<span className="text-success">.</span></h1>
        <p className="hero-type mt-4 whitespace-pre-line font-semibold">{t("cy.headline")}</p>
        <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">{t("cy.sub")}</p>
        <div className="mt-7 flex flex-wrap gap-3"><Button asChild variant="neon" size="lg" className="hero-cta"><Link to="/new"><Zap />{t("cy.start")}<ArrowUpRight /></Link></Button><Button asChild variant="glass" size="lg" className="h-12"><a href="#faq"><Code2 />{t("nav.guide")}</a></Button></div>
      </MotionReveal>
       <div className="hero-annotation"><p>{t("cy.todayLeader")} <span className="text-[8px]">USDT</span></p><a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer" className="leader-name mt-2 block"><span className="block text-lg font-semibold">{displayName}</span><span className="text-xs">@{handle}</span></a>{!leaderHandle && <p className="mt-2 text-[9px] text-muted-foreground">{t("cy.testLeader")}</p>}</div>
    </section>
    <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
      <CampaignHub />
    </div>
    <section id="faq" className="scroll-mt-24 border-y border-border bg-card/35">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <MotionReveal><p className="font-mono text-[10px] text-primary">GROWTH GUIDE / 01</p><h2 className="mt-4 text-3xl font-semibold">{t("faq.title")}</h2><p className="mt-3 text-sm text-muted-foreground">{t("faq.sub")}</p></MotionReveal>
        <MotionReveal delay={0.1}>
          <Accordion type="single" collapsible className="mt-8">
            {([1, 2, 3, 4, 5, 6, 7, 9, 10, 11] as const).map((n) => (
              <AccordionItem key={n} value={`q${n}`}>
                <AccordionTrigger>{t(`faq.q${n}`)}</AccordionTrigger>
                <AccordionContent className="text-sm leading-7 text-muted-foreground">{t(`faq.a${n}`)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </MotionReveal>
      </div>
    </section>
  </>;
}