import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
import { feeAmount } from "@/lib/fees";
import { AFF, commissionFor } from "@/lib/affiliate";
import { joinAffiliate } from "@/lib/affiliate.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowUpRight, BadgeCheck, Link2, ShieldAlert, ShieldCheck, UserPlus, Wallet, XCircle } from "lucide-react";

export const Route = createFileRoute("/affiliate")({
  head: () => ({ meta: [
    { title: "联盟计划 · FairDraw — 分享净收入 30%" },
    { name: "description", content: "推荐发起者使用 FairDraw：活动净收入（服务费 − 直接成本）你分 30%，持续 12 个月，USDT 链上结算。" },
    { property: "og:title", content: "FairDraw Affiliate Program — 30% of net revenue" },
  ] }),
  component: AffiliateLanding,
});

/** Demo-only hero feed — clearly labelled sample data, never stored. */
const FEED = [
  ["MT", "#b45f7c", "@Mirr***UK", "回复赢 50 USDT", 4.0],
  ["GW", "#8b6b4a", "@gwvp***ing", "回复赢 200 USDT", 16.0],
  ["ZH", "#f59e0b", "@zhan***88", "回复赢 20 USDT", 1.6],
  ["VP", "#3b82f6", "@Mirr***VPN", "回复赢 100 USDT", 8.0],
  ["CM", "#8b5cf6", "@chak***ion", "回复赢 30 USDT", 2.4],
] as const;

function AffiliateLanding() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tiers = useFeeTiers();
  const [fi, setFi] = useState(0);
  const [total, setTotal] = useState(96.3);
  const [wfTab, setWfTab] = useState<"usdt" | "card">("usdt");
  const [agree, setAgree] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setFi((i) => {
        const n = (i + FEED.length - 1) % FEED.length;
        setTotal((v) => v + FEED[n][4] * 0.85 * AFF.share);
        return n;
      });
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const [n, setN] = useState(5);
  const [a, setA] = useState(2);
  const [p, setP] = useState(100);
  const [r, setR] = useState(70);

  const calc = useMemo(() => {
    // Per-campaign commission at the selected pool, tiered fee → net share.
    const per = commissionFor(p, feeAmount(tiers.data ?? [], p), "chain").amount;
    const months: number[] = [];
    let year = 0, act = 0;
    for (let m = 1; m <= AFF.earnMonths; m++) {
      let s = 0;
      for (let c = 1; c <= m; c++) s += n * Math.pow(r / 100, m - c);
      const com = s * a * per;
      months.push(com); year += com; act = s;
    }
    return { months, year, act, per };
  }, [n, a, p, r, tiers.data]);

  const pool = 100;
  const wfFee = feeAmount(tiers.data ?? [], pool);
  const wf: [string, string, number][] = wfTab === "usdt"
    ? [
        [t("aff.wf.fee"), `${t("aff.wf.pool")} 100 USDT`, wfFee],
        [t("aff.wf.gasIn"), t("aff.wf.gasInSub"), -AFF.chainCost / 4],
        [t("aff.wf.gasOut"), t("aff.wf.gasOutSub"), -AFF.chainCost / 4],
        [t("aff.wf.screen"), t("aff.wf.screenSub"), -AFF.chainCost / 2],
      ]
    : [
        [t("aff.wf.fee"), `${t("aff.wf.pool")} ¥100`, wfFee],
        [t("aff.wf.stripe"), t("aff.wf.stripeSub"), -((pool + wfFee) * AFF.stripeRate)],
        [t("aff.wf.cardFee"), t("aff.wf.cardFeeSub"), -AFF.stripeFixed],
      ];
  const wfNet = wf.reduce((s, row) => s + row[2], 0);
  const wfYou = Math.max(0, wfNet) * AFF.share;
  const wfFlat = wfFee * AFF.share;

  const join = async () => {
    if (!agree) { toast.error(t("aff.join.needAgree")); return; }
    if (!user) { navigate({ to: "/auth" }); return; }
    setJoining(true);
    try {
      await joinAffiliate({});
      navigate({ to: "/affiliate/dashboard" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const range = (id: string, label: string, val: number, set: (v: number) => void, min: number, max: number, step = 1, unit = "") => (
    <div className="aff-ctl">
      <div className="aff-ctl-h"><label htmlFor={id}>{label}</label><b>{val.toLocaleString()}{unit}</b></div>
      <input id={id} type="range" min={min} max={max} step={step} value={val}
        onChange={(e) => set(Number(e.target.value))}
        style={{ "--p": `${((val - min) / (max - min)) * 100}%` } as CSSProperties} />
    </div>
  );

  return <section className="page-aff mx-auto max-w-6xl px-5 pb-20 sm:px-8">
    {/* hero */}
    <div className="aff-hero">
      <div>
        <span className="aff-pill">✦ {t("aff.pill")}</span>
        <h1 className="aff-h1">{t("aff.h1a")}<br />{t("aff.h1b")} <em>{t("aff.h1em")}</em></h1>
        <p className="aff-lead" dangerouslySetInnerHTML={{ __html: t("aff.lead") }} />
        <div className="flex flex-wrap gap-3 pt-6">
          <Button size="lg" variant="neon" onClick={() => document.getElementById("aff-join")?.scrollIntoView({ behavior: "smooth" })}>{t("aff.cta.join")}<ArrowUpRight /></Button>
          <Button size="lg" variant="glass" onClick={() => document.getElementById("aff-how")?.scrollIntoView({ behavior: "smooth" })}>{t("aff.cta.how")}</Button>
        </div>
        <div className="aff-trust">
          <span><BadgeCheck className="size-4 text-success" />{t("aff.trust1")}</span>
          <span><BadgeCheck className="size-4 text-success" />{t("aff.trust2")}</span>
          <span><BadgeCheck className="size-4 text-success" />{t("aff.trust3")}</span>
        </div>
      </div>
      <div className="aff-cc"><div className="aff-cc-in">
        <div className="aff-cc-h"><span>{t("aff.demo.tag")}</span><b>{t("aff.demo.live")}</b></div>
        <div className="aff-cc-big">{total.toFixed(2)}<small>USDT</small></div>
        <div className="aff-cc-sub">{t("aff.demo.sub")}</div>
        <div className="flex flex-col gap-2 pt-4">
          {[0, 1, 2].map((i) => {
            const x = FEED[(fi + i) % FEED.length];
            const net = x[4] * 0.85, you = net * AFF.share;
            return <div key={`${x[0]}-${i}`} className="aff-fl">
              <span className="aff-av" style={{ background: x[1] }}>{x[0]}</span>
              <div className="min-w-0 flex-1"><b className="text-sm font-medium">{x[2]}</b><span className="block text-xs text-muted-foreground">{x[3]} · {t("aff.demo.net")} {net.toFixed(2)}</span></div>
              <span className="font-mono text-sm font-bold text-success">+{you.toFixed(2)}</span>
            </div>;
          })}
        </div>
      </div></div>
    </div>

    {/* steps */}
    <div className="aff-sec">
      <div className="aff-sh"><p className="eyebrow">HOW IT WORKS</p><h2>{t("aff.steps.title")}</h2></div>
      <div className="grid gap-4 md:grid-cols-3">
        {([["01", <Link2 key="i" className="size-5 text-white" />, t("aff.s1.t"), t("aff.s1.d")],
          ["02", <UserPlus key="i" className="size-5 text-white" />, t("aff.s2.t"), t("aff.s2.d")],
          ["03", <Wallet key="i" className="size-5 text-white" />, t("aff.s3.t"), t("aff.s3.d")]] as const).map(([num, icon, tt, dd]) => (
          <div key={num} className="cyber-panel aff-step"><span className="aff-num">{num}</span>
            <span className={`aff-ic ${num === "03" ? "g" : ""}`}>{icon}</span>
            <h3 className="text-lg font-semibold">{tt}</h3><p className="mt-1.5 text-sm text-muted-foreground">{dd}</p>
          </div>
        ))}
      </div>
    </div>

    {/* formula + waterfall */}
    <div className="aff-sec" id="aff-how">
      <div className="aff-sh"><p className="eyebrow">HOW YOU EARN</p><h2>{t("aff.earn.title")}</h2><p>{t("aff.earn.sub")}</p></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="cyber-panel p-6">
          <h3 className="text-lg font-semibold">{t("aff.formula.t")}</h3>
          <div className="aff-eq">
            <span>{t("aff.eq.fee")}</span><i>−</i><span>{t("aff.eq.cost")}</span><i>=</i><span>{t("aff.eq.net")}</span><i>×</i><span className="g">30%</span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t("aff.costNote")}</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {["aff.costL1", "aff.costL2", "aff.costL3"].map((k) => <li key={k} className="flex gap-2"><span className="aff-dot" /><span dangerouslySetInnerHTML={{ __html: t(k) }} /></li>)}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: t("aff.costFoot") }} />
        </div>
        <div className="cyber-panel p-6">
          <div className="mb-4 flex w-max max-w-full gap-1 rounded-lg border border-border bg-black/30 p-1">
            {(["usdt", "card"] as const).map((k) => <button key={k} className={`rounded-md px-3 py-1.5 text-xs ${wfTab === k ? "bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]" : "text-muted-foreground"}`} onClick={() => setWfTab(k)} aria-selected={wfTab === k}>{t(k === "usdt" ? "aff.wf.usdt" : "aff.wf.card")}</button>)}
          </div>
          <div>
            {wf.map((row) => <div key={row[0]} className={`aff-wr ${row[2] < 0 ? "minus" : ""}`}><span>{row[0]}<small>{row[1]}</small></span><b>{row[2] < 0 ? "−" : ""}{Math.abs(row[2]).toFixed(2)}</b></div>)}
            <div className="aff-wr sum"><span>{t("aff.wf.net")}</span><b>{wfNet.toFixed(2)}</b></div>
            <div className="aff-wr you"><span>{t("aff.wf.you")}</span><b>{wfYou.toFixed(2)} {wfTab === "usdt" ? "USDT" : "CNY"}</b></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("aff.wf.note", { flat: wfFlat.toFixed(2), net: wfYou.toFixed(2) })}</p>
        </div>
      </div>
    </div>

    {/* calculator */}
    <div className="aff-sec">
      <div className="aff-sh"><p className="eyebrow">CALCULATOR</p><h2>{t("aff.calc.title")}</h2></div>
      <div className="cyber-panel aff-calc">
        <div className="p-6">
          {range("aff-n", t("aff.calc.n"), n, setN, 1, 50, 1, ` ${t("aff.unit.refs")}`)}
          {range("aff-a", t("aff.calc.a"), a, setA, 1, 10, 1, ` ${t("aff.unit.camps")}`)}
          {range("aff-p", t("aff.calc.p"), p, setP, 10, 2000, 10, " USDT")}
          {range("aff-r", t("aff.calc.r"), r, setR, 30, 95, 5, "%")}
        </div>
        <div className="aff-calc-r">
          <p className="text-xs text-muted-foreground">{t("aff.calc.month")}</p>
          <p className="aff-res-big">{calc.months[11]?.toFixed(0) ?? 0}<small>USDT</small></p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>{t("aff.calc.year")} <b>{calc.year.toFixed(0)}</b> USDT</span>
            <span>{t("aff.calc.per")} <b>{calc.per.toFixed(2)}</b> USDT</span>
            <span>{t("aff.calc.act")} <b>{Math.round(calc.act)}</b></span>
          </div>
          <div className="aff-bars">
            {calc.months.map((v, i) => <div key={i} style={{ height: `${Math.max(3, (v / (Math.max(...calc.months) || 1)) * 100)}%` }} data-v={`${i + 1}M · ${v.toFixed(0)} USDT`} />)}
          </div>
          <div className="flex justify-between pt-1 font-mono text-[11px] text-muted-foreground"><span>{t("aff.calc.m1")}</span><span>{t("aff.calc.m6")}</span><span>{t("aff.calc.m12")}</span></div>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">{t("aff.calc.note")}</p>
        </div>
      </div>
    </div>

    {/* who */}
    <div className="aff-sec">
      <div className="aff-sh"><p className="eyebrow">WHO IT'S FOR</p><h2>{t("aff.who.title")}</h2></div>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {(["📣", "👥", "🛠️", "✍️"] as const).map((e, i) => (
          <div key={e} className="cyber-panel p-5"><div className="text-2xl">{e}</div><b className="mt-2.5 block">{t(`aff.w${i + 1}.t`)}</b><span className="text-xs text-muted-foreground">{t(`aff.w${i + 1}.d`)}</span></div>
        ))}
      </div>
    </div>

    {/* rules */}
    <div className="aff-sec">
      <div className="aff-sh"><p className="eyebrow">RULES</p><h2>{t("aff.rules.title")}</h2></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="cyber-panel p-6">
          <h3 className="mb-3.5 flex items-center gap-2.5 font-semibold"><ShieldCheck className="size-5 text-success" />{t("aff.rules.ok")}</h3>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {["aff.ok1", "aff.ok2", "aff.ok3", "aff.ok4"].map((k) => <li key={k} className="flex gap-2.5"><span className="aff-dot g" /><span dangerouslySetInnerHTML={{ __html: t(k) }} /></li>)}
          </ul>
        </div>
        <div className="cyber-panel border-destructive/25 bg-destructive/5 p-6">
          <h3 className="mb-3.5 flex items-center gap-2.5 font-semibold"><XCircle className="size-5 text-destructive" />{t("aff.rules.no")}</h3>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {["aff.no1", "aff.no2", "aff.no3", "aff.no4"].map((k) => <li key={k} className="flex gap-2.5"><span className="aff-dot r" /><span dangerouslySetInnerHTML={{ __html: t(k) }} /></li>)}
          </ul>
        </div>
      </div>
    </div>

    {/* faq */}
    <div className="aff-sec">
      <div className="aff-sh"><p className="eyebrow">FAQ</p><h2>{t("aff.faq.title")}</h2></div>
      <div className="mx-auto max-w-3xl space-y-2.5">
        {[1, 2, 3, 4, 5, 6].map((i) => <details key={i} className="aff-q group"><summary>{t(`aff.q${i}`)}<span>+</span></summary><p>{t(`aff.a${i}`)}</p></details>)}
      </div>
    </div>

    {/* join */}
    <div className="cyber-panel aff-join" id="aff-join">
      <div className="aff-join-l">
        <h2 className="text-3xl font-black leading-tight">{t("aff.join.t")}</h2>
        <p className="mt-2.5 text-sm text-muted-foreground">{t("aff.join.sub")}</p>
      </div>
      <div className="p-8">
        <Button size="lg" className="h-14 w-full justify-center text-base font-bold" variant="neon" onClick={join} disabled={joining}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16Z" /></svg>
          {user ? t("aff.join.btn") : t("aff.join.btnX")}
        </Button>
        <label className="mt-3.5 flex cursor-pointer items-start gap-2.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span dangerouslySetInnerHTML={{ __html: t("aff.join.agree") }} />
        </label>
        <ul className="mt-5 space-y-2.5 border-t border-border pt-4 text-xs text-muted-foreground">
          <li className="flex gap-2.5"><span className="aff-tag">{t("aff.join.now")}</span><span dangerouslySetInnerHTML={{ __html: t("aff.join.l1") }} /></li>
          <li className="flex gap-2.5"><span className="aff-tag">{t("aff.join.later")}</span><span dangerouslySetInnerHTML={{ __html: t("aff.join.l2") }} /></li>
          <li className="flex gap-2.5"><span className="aff-tag">{t("aff.join.payout")}</span><span dangerouslySetInnerHTML={{ __html: t("aff.join.l3") }} /></li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground/70"><ShieldAlert className="mr-1 inline size-3.5 text-prize" />{t("aff.join.disc")}</p>
      </div>
    </div>
  </section>;
}
