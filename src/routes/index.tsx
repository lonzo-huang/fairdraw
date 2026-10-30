import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Code2, Fingerprint, ShieldCheck, Terminal, Ticket, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { simulateCost, todayLeader, xHandleFromUrl } from "@/lib/campaign-hub";
import { usePublicHub } from "@/hooks/use-public-hub";
import testAvatar from "@/assets/mirrortek-avatar.jpg.asset.json";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DrawScene } from "@/components/draw-scene";
import { xDisplayName } from "@/lib/sponsor-ranking";
import { CampaignHub } from "@/components/campaign-hub";
import { AnimatedNumber } from "@/components/animated-value";
import { LiveTicker } from "@/components/live-ticker";
import { MotionSurface, MotionReveal } from "@/components/motion-surface";

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
        <div className="mt-7 flex flex-wrap gap-3"><Button asChild variant="neon" size="lg" className="hero-cta"><Link to="/new"><Zap />{t("cy.start")}<ArrowUpRight /></Link></Button><Button asChild variant="glass" size="lg" className="h-12"><a href="#how"><Code2 />{t("cy.how")}</a></Button></div>
      </MotionReveal>
       <div className="hero-annotation"><p>{t("cy.todayLeader")} <span className="text-[8px]">USDT</span></p><a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer" className="leader-name mt-2 block"><span className="block text-lg font-semibold">{displayName}</span><span className="text-xs">@{handle}</span></a>{!leaderHandle && <p className="mt-2 text-[9px] text-muted-foreground">{t("cy.testLeader")}</p>}</div>
    </section>
    <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
      <CampaignHub />
    </div>
    <section id="calculator" className="scroll-mt-24 border-y border-border bg-card/35">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <MotionReveal><p className="font-mono text-[10px] text-primary">CAMPAIGN SIMULATOR / 01</p><h2 className="mt-4 max-w-md text-3xl font-semibold leading-snug">{t("cy.simTitle")}</h2><p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">{t("cy.simSub")}</p><div className="mt-8 flex items-center gap-3 text-xs text-muted-foreground"><Fingerprint className="size-8 text-primary" />{t("home.notice")}</div></MotionReveal>
        <MotionSurface><Calculator /></MotionSurface>
      </div>
    </section>
    <section id="how" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-12 sm:px-8">
      <MotionReveal><p className="font-mono text-[10px] text-success">THE FLOW / 02</p><h2 className="mt-3 text-2xl font-semibold">{t("how.title")}</h2></MotionReveal>
      <div className="mt-7 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">{([1, 2, 3, 4] as const).map((n) => <MotionReveal key={n} delay={n * 0.08} className="border-t border-border pt-5"><span className="font-mono text-xs text-primary">0{n} /</span><h3 className="mt-3 text-sm font-medium">{t(`how.${n}t`)}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{t(`how.${n}d`)}</p></MotionReveal>)}</div>
    </section>
    <section id="security" className="scroll-mt-24 border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-2">
        <MotionReveal className="proof-terminal terminal-grid overflow-hidden rounded-lg border border-primary/30 bg-card/40"><div className="flex items-center justify-between border-b border-border px-5 py-3 font-mono text-[10px] text-muted-foreground"><span className="flex items-center gap-2"><Terminal className="size-3.5" /> fairdraw / proof.ts</span><span className="text-success">SHA-256</span></div><pre className="overflow-x-auto p-5 font-mono text-[11px] leading-7 sm:p-7"><code><span className="text-muted-foreground">{"// Public. Deterministic. Verifiable.\n"}</span><span className="text-cyber">{"const "}</span>{"fingerprint = "}<span className="text-success">{"sha256"}</span>{"(candidates);\n"}<span className="text-cyber">{"const "}</span>{"seed = "}<span className="text-success">{"sha256"}</span>{"(fingerprint + time);\n\n"}<span className="text-cyber">{"const "}</span>{"winners = "}<span className="text-primary">{"draw"}</span>{"({\n  candidates,\n  seed,\n  winnersCount\n});\n\n"}<span className="terminal-cursor text-success">{"▍"}</span></code></pre></MotionReveal>
        <MotionReveal delay={0.12}><p className="font-mono text-[10px] text-success">TRUST BY DESIGN / 03</p><h2 className="mt-4 text-3xl font-semibold">{t("cy.trustTitle")}</h2><p className="mt-3 text-sm text-muted-foreground">{t("cy.trustSub")}</p><div className="mt-7 space-y-4">{(["cy.public", "cy.recompute", "cy.payout"] as const).map((key) => <p key={key} className="flex items-center gap-3 text-sm"><ShieldCheck className="size-4 text-success" />{t(key)}</p>)}</div><p className="mt-6 border-l-2 border-primary/40 pl-4 text-xs leading-6 text-muted-foreground">{t("cy.honest")}</p><Button asChild variant="link" className="mt-4 px-0"><Link to="/pricing">{t("nav.pricing")}<ArrowRight /></Link></Button></MotionReveal>
      </div>
    </section>
  </>;
}

function Calculator() {
  const { t } = useI18n();
  const [pool, setPool] = useState(50); const [target, setTarget] = useState(500);
  return <div className="cyber-panel rounded-lg border border-primary/25 p-6 shadow-glow sm:p-7">
    <div className="flex items-center justify-between border-b border-border pb-4"><span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground"><Ticket className="size-4 text-primary" /> BUDGET CONSOLE</span><span className="font-mono text-[10px] text-primary">USDT</span></div>
    <div className="mt-6 flex items-center justify-between"><label id="pool-label" className="text-xs text-muted-foreground">{t("cy.pool")}</label><span className="font-mono text-lg font-semibold text-success"><AnimatedNumber value={pool} /> <span className="text-xs">USDT</span></span></div>
    <Slider aria-labelledby="pool-label" value={[pool]} min={10} max={1000} step={10} onValueChange={([v]) => setPool(v ?? 50)} className="mt-5" />
    <div className="mt-8 flex items-center justify-between"><label id="target-label" className="text-xs text-muted-foreground">{t("cy.target")}</label><span className="font-mono text-lg"><AnimatedNumber value={target} /></span></div>
    <Slider aria-labelledby="target-label" value={[target]} min={100} max={10000} step={100} onValueChange={([v]) => setTarget(v ?? 500)} className="mt-5" />
    <p className="mt-3 text-[10px] text-muted-foreground">{t("cy.actions")}</p>
    <div className="mt-6 grid grid-cols-2 gap-4 border-y border-border py-5"><div><p className="text-[9px] text-muted-foreground">{t("cy.interactions")}</p><p className="mt-2 font-mono text-2xl font-semibold"><AnimatedNumber value={target * 2} /></p></div><div className="border-l border-border pl-4"><p className="text-[9px] text-muted-foreground">{t("cy.cost")}</p><p className="mt-2 font-mono text-2xl font-semibold text-success"><AnimatedNumber value={simulateCost(pool, target)} decimals={3} /><span className="ml-1 text-[10px]">USDT</span></p></div></div>
    <Button asChild variant="neon" className="mt-5 w-full"><Link to="/new">{t("cy.simStart")}<ArrowUpRight /></Link></Button><p className="mt-3 text-center text-[10px] leading-5 text-muted-foreground">{t("cy.estimate")}</p>
  </div>;
}