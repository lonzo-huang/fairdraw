import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translate, useI18n } from "@/lib/i18n";
import { parseConditions, type Metrics } from "@/lib/conditions";
import { feeRate, type FeeTier } from "@/lib/fees";
import { Check, Copy, Gift, Heart, MessageCircle, Plus, Repeat2, Search, Send, ShieldCheck, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "涨粉攻略 — FairDraw" },
      { name: "description", content: "FairDraw 涨粉攻略：平台用法、参与方式、公平开奖与派奖的全部说明。" },
      { property: "og:title", content: "涨粉攻略 — FairDraw" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Guide,
});

const engOf = (m: Metrics | null | undefined) =>
  (m?.likes ?? 0) + (m?.replies ?? 0) + (m?.reposts ?? 0) + (m?.quotes ?? 0);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
};
const short = (n: number) => (n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1e3 ? `${Math.round(n / 100) / 10}K` : String(Math.round(n)));
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type CampRow = {
  slug: string; title: string; handle: string | null; pool: number | null; cur: string;
  participants: number; winners: number; nConds: number;
  views: number | null; eng: number | null; fol: number | null;
};
type GuideStats = {
  drawn: number; avgP: number;
  t1: { has: boolean; avg: number }[]; // [single-winner, multi-winner]
  t2: { has: boolean; avg: number }[]; // [0 conds, 1 cond, 2+ conds]
  K: number; viewRatio: number; folRatio: number;
  heat: number[][]; heatMax: number;
  cases: CampRow[];
  tiers: FeeTier[];
};

/** Real aggregates from drawn campaigns, their draw rows and metric snapshots. */
function useGuideStats() {
  return useQuery({
    queryKey: ["guide-stats"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GuideStats | null> => {
      const [{ data: camps }, { data: draws }, { data: snaps }, { data: tiers }] = await Promise.all([
        supabase.from("campaigns").select("id,slug,title,prize_amount,currency,conditions"),
        supabase.from("draws").select("campaign_id,candidates,winners"),
        supabase.from("condition_snapshots").select("campaign_id,metrics,fetched_at").order("fetched_at").limit(6000),
        supabase.from("fee_tiers").select("min_amount,rate_percent"),
      ]);
      const drawByC = new Map((draws ?? []).map((d) => [d.campaign_id, d]));
      const drawn = (camps ?? []).filter((c) => drawByC.has(c.id));
      const snapByC = new Map<string, { m: Metrics; t: number }[]>();
      for (const s of snaps ?? []) {
        const arr = snapByC.get(s.campaign_id) ?? [];
        arr.push({ m: s.metrics as Metrics, t: new Date(s.fetched_at).getTime() });
        snapByC.set(s.campaign_id, arr);
      }
      const rows: CampRow[] = drawn.map((c) => {
        const d = drawByC.get(c.id)!;
        const cands = (d.candidates ?? []) as { id: string; handle: string }[];
        const wins = (d.winners ?? []) as { id: string; handle: string }[];
        const nConds = Object.values(parseConditions(c.conditions)).filter((v) => v !== undefined).length;
        const ss = snapByC.get(c.id) ?? [];
        const firstM = ss[0]?.m ?? null;
        const lastM = ss[ss.length - 1]?.m ?? null;
        const fol = firstM?.followers != null && lastM?.followers != null ? lastM.followers - firstM.followers : null;
        return {
          slug: c.slug, title: c.title, handle: lastM?.author_handle ?? null,
          pool: c.prize_amount, cur: c.currency,
          participants: cands.length, winners: wins.length, nConds,
          views: lastM?.views ?? null, eng: lastM ? engOf(lastM) : null, fol,
        };
      });
      const one = rows.filter((r) => r.winners === 1);
      const many = rows.filter((r) => r.winners > 1);
      const g0 = rows.filter((r) => r.nConds === 0);
      const g1 = rows.filter((r) => r.nConds === 1);
      const g2 = rows.filter((r) => r.nConds >= 2);
      // Fit the participation model's coefficient to real campaigns.
      const ks = rows
        .filter((r) => r.pool && r.pool > 0 && r.participants > 0)
        .map((r) => r.participants / (Math.pow(r.pool!, 0.55) * Math.min(2.2, 1 + Math.log(Math.max(1, r.winners)) * 0.45) * Math.pow(0.68, Math.max(0, r.nConds))));
      const K = med(ks) ?? 38;
      const viewRatio = med(rows.filter((r) => r.views && r.views > 0 && r.participants > 0).map((r) => r.views! / r.participants)) ?? 60;
      const folRatio = med(rows.filter((r) => r.fol != null && r.participants > 0).map((r) => Math.max(0, r.fol!) / r.participants)) ?? 0.08;
      // Engagement deltas bucketed by (weekday, hour) in UTC+8.
      const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
      snapByC.forEach((arr) => {
        arr.sort((a, b) => a.t - b.t);
        for (let i = 1; i < arr.length; i++) {
          const dv = engOf(arr[i]!.m) - engOf(arr[i - 1]!.m);
          if (dv <= 0) continue;
          const d8 = new Date(arr[i]!.t + 8 * 3600e3);
          heat[(d8.getUTCDay() + 6) % 7]![d8.getUTCHours()]! += dv;
        }
      });
      const heatMax = Math.max(0, ...heat.flat());
      const cases = [...rows].filter((r) => r.eng != null).sort((a, b) => (b.eng ?? 0) - (a.eng ?? 0)).slice(0, 3);
      return {
        drawn: rows.length, avgP: avg(rows.map((r) => r.participants)),
        t1: [{ has: one.length > 0, avg: avg(one.map((r) => r.participants)) }, { has: many.length > 0, avg: avg(many.map((r) => r.participants)) }],
        t2: [{ has: g0.length > 0, avg: avg(g0.map((r) => r.participants)) }, { has: g1.length > 0, avg: avg(g1.map((r) => r.participants)) }, { has: g2.length > 0, avg: avg(g2.map((r) => r.participants)) }],
        K, viewRatio, folRatio, heat, heatMax, cases,
        tiers: (tiers ?? []) as FeeTier[],
      };
    },
  });
}

type FaqQ = { id: string; q: string; a: string; k?: string; act?: { l: string; to?: string; href?: string; result?: boolean } };
type FaqG = { id: string; name: string; who: string; color: string; bg: string; I: typeof Gift; q: FaqQ[] };

const GROUPS: FaqG[] = [
  {
    id: "g-start", name: "gd.g1", who: "gd.who1", color: "#f5b83d", bg: "rgba(245,184,61,.12)", I: TrendingUp,
    q: [
      { id: "what", q: "faq.q1", a: "faq.a1" },
      { id: "why", q: "faq.q2", a: "faq.a2" },
      { id: "how", q: "faq.q3", a: "faq.a3", act: { l: "gd.actStart", to: "/new" } },
      { id: "fee", q: "gd.qFee", a: "gd.aFee", k: "gd.qFeeK" },
      { id: "fail", q: "faq.q10", a: "faq.a10" },
    ],
  },
  {
    id: "g-join", name: "gd.g2", who: "gd.who2", color: "#34d399", bg: "rgba(52,211,153,.12)", I: Gift,
    q: [
      { id: "join", q: "faq.q4", a: "faq.a4", k: "gd.qJoinK", act: { l: "gd.actLive", to: "/" } },
      { id: "claim", q: "faq.q6", a: "faq.a6", k: "gd.qClaimK" },
      { id: "bluev", q: "faq.q7", a: "faq.a7", k: "gd.qBlueK" },
      { id: "max", q: "faq.q9", a: "faq.a9" },
    ],
  },
  {
    id: "g-trust", name: "gd.g3", who: "gd.who3", color: "#a99bff", bg: "rgba(124,92,255,.14)", I: ShieldCheck,
    q: [
      { id: "fair", q: "faq.q5", a: "faq.a5", k: "gd.qFairK", act: { l: "gd.actVerify", result: true } },
      { id: "escrow", q: "gd.qEscrow", a: "gd.aEscrow" },
      { id: "xrule", q: "faq.q11", a: "faq.a11", k: "gd.qXruleK", act: { l: "gd.actXrules", href: "https://help.x.com/en/rules-and-policies" } },
    ],
  },
];

const CASE_AV = ["linear-gradient(135deg,#f59e9e,#b45f7c)", "radial-gradient(circle at 30% 30%,#5aa0ff,#173a8a)", "linear-gradient(135deg,#8b6b4a,#3a2a1e)"];

function Guide() {
  const { t, lang } = useI18n();
  const { data: st } = useGuideStats();
  const [qstr, setQstr] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [fb, setFb] = useState<Record<string, "up" | "down">>({});
  const [onG, setOnG] = useState("g-start");
  const [tplIdx, setTplIdx] = useState(0);
  const [pool, setPool] = useState(50);
  const [win, setWin] = useState(5);
  const [conds, setConds] = useState<Set<string>>(new Set(["rt"]));
  const searchRef = useRef<HTMLInputElement>(null);
  const fbodyRef = useRef<HTMLDivElement>(null);

  const words = useMemo(() => qstr.toLowerCase().split(/\s+/).filter(Boolean), [qstr]);
  const hl = (text: string) => {
    if (!words.length) return text;
    const re = new RegExp(`(${words.map(escRe).join("|")})`, "gi");
    return text.split(re).map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p));
  };
  const match = (item: FaqQ) => {
    if (!words.length) return true;
    const hay = `${t(item.q)} ${t(item.a)} ${item.k ? t(item.k) : ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const filtered = GROUPS.map((g) => ({ ...g, qs: g.q.filter(match) })).filter((g) => g.qs.length);
  const total = filtered.reduce((n, g) => n + g.qs.length, 0);
  const isOpen = (id: string) => (qstr ? true : open.has(id));
  const filteredIds = filtered.map((g) => g.id).join(",");

  // "/" focuses search; deep links open the question; FAQ JSON-LD for SEO.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const h = location.hash.slice(1);
    if (h && GROUPS.some((g) => g.q.some((q) => q.id === h))) {
      setOpen(new Set([h]));
      setTimeout(() => document.getElementById(h)?.scrollIntoView(), 60);
    }
    const sc = document.createElement("script");
    sc.type = "application/ld+json";
    sc.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: GROUPS.flatMap((g) => g.q.map((q) => ({ "@type": "Question", name: t(q.q), acceptedAnswer: { "@type": "Answer", text: t(q.a) } }))),
    });
    document.head.appendChild(sc);
    return () => { document.removeEventListener("keydown", onKey); sc.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Scroll-spy on the visible FAQ groups.
  useEffect(() => {
    const root = fbodyRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((en) => en.isIntersecting && setOnG(en.target.id)),
      { rootMargin: "-40% 0px -55% 0px" },
    );
    root.querySelectorAll(".fgroup").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [filteredIds, qstr]);

  const copy = (v: string, msg: string) => { navigator.clipboard.writeText(v).catch(() => {}); toast.success(msg); };
  const firstResult = st?.cases[0]?.slug ?? null;

  // Growth model calibrated to real campaign outcomes.
  const extra = conds.size;
  const winF = Math.min(2.2, 1 + Math.log(win) * 0.45);
  const ppl = Math.max(1, Math.round((st?.K ?? 38) * Math.pow(pool, 0.55) * winF * Math.pow(0.68, extra)));
  const view = Math.round(ppl * (st?.viewRatio ?? 60) * (conds.has("rt") ? 2 : 1) * (conds.has("quote") ? 1.3 : 1));
  const fol = Math.max(1, Math.round(ppl * (st?.folRatio ?? 0.08) * (conds.has("rt") ? 1.2 : 1)));
  const rate = feeRate(st?.tiers?.length ? st.tiers : [{ min_amount: 0, rate_percent: 8 }], pool) / 100;
  const cost = pool * (1 + rate);
  const rangePct = (v: number, lo: number, hi: number) => ({ "--p": `${((v - lo) / (hi - lo)) * 100}%` }) as CSSProperties;

  const toggleCond = (k: string) => setConds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pickHot = (k: string) => { setQstr(k); document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" }); };

  const bar = (item: { has: boolean; avg: number }, label: string, color: string, max: number) => (
    <div key={label}>
      <div className="h"><span>{label}</span><b>{item.has ? translate(lang, "gd.avgPpl", { n: Math.round(item.avg) }) : "—"}</b></div>
      <div className="b"><i style={{ width: `${item.has && max > 0 ? Math.max(3, (item.avg / max) * 100) : 0}%`, background: color }} /></div>
    </div>
  );

  return (
    <div className="page-gd">
      <div className="wrap">
        <div className="hero">
          <span className="pill">{t("gd.pill")}</span>
          <h1>{t("gd.h1a")}<br /><em>{t("gd.h1b")}</em></h1>
          <p>{t("gd.hsub")}</p>
          <label className="search">
            <Search />
            <input ref={searchRef} placeholder={t("gd.searchPh")} aria-label={t("gd.searchPh")} value={qstr}
              onChange={(e) => setQstr(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" })} />
            <kbd>/</kbd>
          </label>
          <div className="hot">{t("gd.hot")}
            {(["gd.hot1", "gd.hot2", "gd.hot3", "gd.hot4"] as const).map((k) => (
              <button key={k} type="button" onClick={() => pickHot(t(k))}>{t(k)}</button>
            ))}
          </div>
        </div>

        <div className="paths">
          <a className="panel path" href="#payment-guides">
            <span className="ic" style={{ background: "rgba(245,184,61,.12)", color: "#f5b83d" }}><TrendingUp /></span>
            <div><b>{t("gd.path1t")}</b><span>{t("gd.path1s")}</span></div>
            <span className="arr">→</span>
          </a>
          <a className="panel path" href="#g-join">
            <span className="ic" style={{ background: "rgba(52,211,153,.12)", color: "#34d399" }}><Gift /></span>
            <div><b>{t("gd.path2t")}</b><span>{t("gd.path2s")}</span></div>
            <span className="arr">→</span>
          </a>
        </div>

        <section className="blk">
          <div className="sh"><div className="ey">{t("gd.stepEy")}</div><h2>{t("gd.stepH2")}</h2></div>
          <div className="steps">
            <div className="panel step"><span className="n">01</span><span className="ic"><ShieldCheck /></span><h3>{t("gd.s1t")}</h3><p>{t("gd.s1d")}</p></div>
            <div className="panel step"><span className="n">02</span><span className="ic"><MessageCircle /></span><h3>{t("gd.s2t")}</h3><p>{t("gd.s2d")}</p></div>
            <div className="panel step"><span className="n">03</span><span className="ic"><Check /></span><h3>{t("gd.s3t")}</h3><p>{t("gd.s3d")}</p></div>
          </div>
        </section>

        <section className="blk" id="payment-guides">
          <div className="sh"><div className="ey">{t("gd.payEy")}</div><h2>{t("gd.payH2")}</h2><p>{t("gd.payP")}</p></div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {([
              { href:"/faq/payment/metamask", label:"MetaMask", sub: lang==="zh"?"加密钱包，浏览器插件 / 手机 App":"Self-custody wallet · extension or mobile app", color:"#e88100" },
              { href:"/faq/payment/binance",  label:"Binance 币安", sub: lang==="zh"?"交易所提币，手续费约 1 USDT":"Exchange withdrawal · ~1 USDT fee", color:"#f0b90b" },
              { href:"/faq/payment/okx",      label:"OKX 欧易",    sub: lang==="zh"?"交易所提币，操作与币安相同":"Exchange withdrawal · same flow as Binance", color:"#8ab4ff" },
            ] as const).map(({ href, label, sub, color }) => (
              <a key={href} href={href} className="panel" style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",textDecoration:"none",borderRadius:14,border:"1px solid var(--border)",background:"var(--card)",transition:"border-color .15s"}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}} />
                <span style={{flex:1}}>
                  <span style={{fontWeight:600,fontSize:15}}>{label}</span>
                  <span style={{display:"block",fontSize:12,color:"var(--muted-foreground)",marginTop:2}}>{sub}</span>
                </span>
                <span style={{fontSize:14,color:"var(--muted-foreground)"}}>→</span>
              </a>
            ))}
          </div>
        </section>

        <section className="blk" id="tips">
          <div className="sh"><div className="ey">{t("gd.tipsEy")}</div><h2>{t("gd.tipsH2")}</h2><p>{t("gd.tipsP")}</p></div>
          <div className="tips">
            <div className="panel tip">
              <span className="tag">{t("gd.t1tag")}</span>
              <h3>{t("gd.t1h")}</h3>
              <p>{t("gd.t1p")}</p>
              <div className="viz cmpbar">
                {st ? (
                  <>
                    {bar(st.t1[0]!, t("gd.t1b1"), "#646f85", Math.max(st.t1[0]!.avg, st.t1[1]!.avg))}
                    {bar(st.t1[1]!, t("gd.t1b2"), "linear-gradient(90deg,#f5b83d,#ffd98a)", Math.max(st.t1[0]!.avg, st.t1[1]!.avg))}
                  </>
                ) : <div className="h"><span>…</span></div>}
              </div>
            </div>
            <div className="panel tip">
              <span className="tag">{t("gd.t2tag")}</span>
              <h3>{t("gd.t2h")}</h3>
              <p>{t("gd.t2p")}</p>
              <div className="viz cmpbar">
                {st ? (
                  <>
                    {bar(st.t2[0]!, t("gd.t2b0"), "#3b82f6", Math.max(...st.t2.map((x) => x.avg)))}
                    {bar(st.t2[1]!, t("gd.t2b1"), "#7c5cff", Math.max(...st.t2.map((x) => x.avg)))}
                    {bar(st.t2[2]!, t("gd.t2b2"), "#646f85", Math.max(...st.t2.map((x) => x.avg)))}
                  </>
                ) : <div className="h"><span>…</span></div>}
              </div>
            </div>
            <div className="panel tip">
              <span className="tag">{t("gd.t3tag")}</span>
              <h3>{t("gd.t3h")}</h3>
              <p>{st ? translate(lang, "gd.t3p", { n: st.drawn, p: Math.round(st.avgP) }) : "…"}</p>
              <div className="viz">
                <div className="stat-big">{st ? <>{st.drawn}<small>{translate(lang, "gd.t3sub", { p: Math.round(st.avgP) })}</small></> : "…"}</div>
              </div>
            </div>
            <div className="panel tip wide">
              <span className="tag">{t("gd.t4tag")}</span>
              <h3>{t("gd.t4h")}</h3>
              <p>{t("gd.t4p")}</p>
              <div className="viz">
                {st && st.heatMax > 0 ? (
                  <>
                    <div className="heat">
                      {t("gd.days").split(",").map((d, di) => (
                        <Fragment key={d}>
                          <span className="lb">{d}</span>
                          {Array.from({ length: 24 }, (_, x) => {
                            const v = st.heat[di]![x]! / st.heatMax;
                            return <span key={x} title={`${d} ${x}:00`} style={{ background: `rgba(245,184,61,${(0.05 + Math.pow(v, 0.6) * 0.95).toFixed(2)})` }} />;
                          })}
                        </Fragment>
                      ))}
                    </div>
                    <div className="heat-x"><span /><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span></div>
                  </>
                ) : (
                  <p style={{ color: "#646f85", fontSize: 13 }}>{st ? t("gd.heatNone") : "…"}</p>
                )}
              </div>
            </div>
            <div className="panel tip">
              <span className="tag">{t("gd.t5tag")}</span>
              <h3>{t("gd.t5h")}</h3>
              <div className="viz">
                <div className="tpl">{t(`gd.tpl${tplIdx}`)}</div>
                <div className="tpl-f">
                  <div className="tpl-tabs">
                    {[0, 1, 2].map((i) => (
                      <button key={i} type="button" aria-pressed={tplIdx === i} onClick={() => setTplIdx(i)}>{t(`gd.tplTab${i}`)}</button>
                    ))}
                  </div>
                  <button type="button" className="ghost" style={{ height: 32, fontSize: 13 }} onClick={() => copy(t(`gd.tpl${tplIdx}`), t("gd.tplCopied"))}>
                    <Copy />{t("gd.tplCopy")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="blk" id="calc">
          <div className="sh"><div className="ey">{t("gd.calcEy")}</div><h2>{t("gd.calcH2")}</h2><p>{t("gd.calcP")}</p></div>
          <div className="panel calc">
            <div className="calc-l">
              <div className="ctl">
                <div className="ctl-h"><label htmlFor="cPool">{t("gd.cPool")}</label><b>{pool} USDT</b></div>
                <input type="range" id="cPool" min={5} max={500} step={5} value={pool} style={rangePct(pool, 5, 500)} onChange={(e) => setPool(+e.target.value)} />
              </div>
              <div className="ctl">
                <div className="ctl-h"><label htmlFor="cWin">{t("gd.cWin")}</label><b>{win}{t("gd.unitPpl")}</b></div>
                <input type="range" id="cWin" min={1} max={20} step={1} value={win} style={rangePct(win, 1, 20)} onChange={(e) => setWin(+e.target.value)} />
              </div>
              <div className="ctl" style={{ marginBottom: 0 }}>
                <div className="ctl-h"><label>{t("gd.cConds")}</label><span style={{ fontSize: 12, color: "#646f85" }}>{t("gd.cReply")}</span></div>
                <div className="opts">
                  <button type="button" className="opt lock" aria-pressed="true"><MessageCircle />{t("gd.optReply")}</button>
                  <button type="button" className="opt" aria-pressed={conds.has("like")} onClick={() => toggleCond("like")}><Heart />{t("gd.optLike")}</button>
                  <button type="button" className="opt" aria-pressed={conds.has("rt")} onClick={() => toggleCond("rt")}><Repeat2 />{t("gd.optRt")}</button>
                  <button type="button" className="opt" aria-pressed={conds.has("quote")} onClick={() => toggleCond("quote")}><Send />{t("gd.optQuote")}</button>
                </div>
              </div>
            </div>
            <div className="calc-r">
              <div className="res-l">{t("gd.resL")}</div>
              <div className="res">
                <div className="main"><div className="v">+{short(fol)}</div><div className="k">{t("gd.rFol")}</div></div>
                <div><div className="v">{short(view)}</div><div className="k">{t("gd.rView")}</div></div>
                <div><div className="v">{short(ppl)}</div><div className="k">{t("gd.rPpl")}</div></div>
              </div>
              <div className="res-l">{t("gd.cost")} <b className="num" style={{ color: "#e8ecf4" }}>{cost.toFixed(2)} USDT</b>，{t("gd.cpf")} <b className="num" style={{ color: "#34d399" }}>${(cost / fol).toFixed(2)}</b></div>
              <p className="note">{t("gd.calcNote")}</p>
              <Link to="/new" className="btn" style={{ marginTop: 20 }}>{t("gd.calcGo")}</Link>
            </div>
          </div>
        </section>

        {st && st.cases.length > 0 && (
          <section className="blk">
            <div className="sh"><div className="ey">{t("gd.caseEy")}</div><h2>{t("gd.caseH2")}</h2><p>{t("gd.caseP")}</p></div>
            <div className="cases">
              {st.cases.map((cs, i) => (
                <div key={cs.slug} className="panel case">
                  <div className="case-h">
                    <span className="av" style={{ background: CASE_AV[i % CASE_AV.length] }}>{(cs.handle ?? cs.title).slice(0, 2).toUpperCase()}</span>
                    <div>
                      <b>{cs.handle ? `@${cs.handle}` : cs.title}</b>
                      <span>{cs.pool !== null ? `${cs.pool} ${cs.cur}` : ""} · {cs.nConds === 0 ? t("gd.t2b0") : `${cs.nConds} ${t("gd.t2tag")}`}</span>
                    </div>
                  </div>
                  <div className="case-n">
                    <div><div className="v" style={{ color: "#38bdf8" }}>{cs.views != null ? short(cs.views) : "—"}</div><div className="k">{t("gd.caseViews")}</div></div>
                    <div><div className="v">{cs.eng != null ? short(cs.eng) : "—"}</div><div className="k">{t("gd.caseEng")}</div></div>
                    <div><div className="v" style={{ color: "#34d399" }}>{cs.fol != null ? `+${short(cs.fol)}` : "—"}</div><div className="k">{t("gd.caseFol")}</div></div>
                  </div>
                  <q>{cs.title} · <Link to="/c/$slug" params={{ slug: cs.slug }}>{t("gd.caseGo")}</Link></q>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="blk" id="faq">
          <div className="sh"><div className="ey">{t("gd.faqEy")}</div><h2>{t("gd.faqH2")}</h2></div>
          <div className="faq">
            <nav className="fnav" aria-label={t("gd.faqH2")}>
              {filtered.map((g) => (
                <Fragment key={g.id}>
                  <div className="g">{t(g.who)}</div>
                  <a href={`#${g.id}`} className={onG === g.id ? "on" : ""}><g.I />{t(g.name)}<span className="c">{g.qs.length}</span></a>
                </Fragment>
              ))}
            </nav>
            <div ref={fbodyRef}>
              {total === 0 ? (
                <div className="panel nores">{translate(lang, "gd.noRes", { q: qstr })}</div>
              ) : filtered.map((g) => (
                <div key={g.id} className="fgroup" id={g.id}>
                  <h3><span className="ic" style={{ background: g.bg, color: g.color }}><g.I /></span>{t(g.name)}</h3>
                  {g.qs.map((item) => (
                    <div key={item.id} className={`q${isOpen(item.id) ? " open" : ""}`} id={item.id}>
                      <button type="button" className="qh" aria-expanded={isOpen(item.id)} aria-controls={`a-${item.id}`}
                        onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })}>
                        {hl(t(item.q))}
                        <span className="chev"><Plus /></span>
                      </button>
                      <div className="qb" id={`a-${item.id}`}>
                        <div>
                          <div className="qa">
                            {hl(t(item.a))}
                            {item.act && (item.act.result ? !!firstResult : true) && (
                              <div className="act">
                                {item.act.href ? (
                                  <a className="ghost" href={item.act.href} target="_blank" rel="noopener noreferrer">{t(item.act.l)} →</a>
                                ) : item.act.result ? (
                                  <Link className="ghost" to="/r/$slug" params={{ slug: firstResult! }}>{t(item.act.l)} →</Link>
                                ) : (
                                  <Link className="ghost" to={item.act.to!}>{t(item.act.l)} →</Link>
                                )}
                              </div>
                            )}
                            {fb[item.id] ? (
                              <div className="qf">
                                {fb[item.id] === "up" ? t("gd.fbThanks") : <>{t("gd.fbSorry")}<Link to="/contact">{t("gd.fbContact")}</Link></>}
                              </div>
                            ) : (
                              <div className="qf">
                                {t("gd.qHelp")}
                                <button type="button" onClick={() => setFb((s) => ({ ...s, [item.id]: "up" }))}>{t("gd.up")}</button>
                                <button type="button" onClick={() => setFb((s) => ({ ...s, [item.id]: "down" }))}>{t("gd.down")}</button>
                                <button type="button" className="lnk" onClick={() => copy(`${location.origin}/guide#${item.id}`, t("gd.qCopied"))}>{t("gd.copyQ")}</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel cta">
          <div>
            <h2>{t("gd.ctaH")}</h2>
            <p>{t("gd.ctaP")}</p>
            <div className="contact">
              <a className="ghost" href="https://x.com/Mirrortekuk" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 13, height: 13 }}><path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16Z" /></svg>
                {t("gd.ctaX")}
              </a>
              <Link className="ghost" to="/contact"><Send style={{ width: 13, height: 13 }} />{t("gd.ctaMail")}</Link>
            </div>
          </div>
          <Link className="btn" to="/new">{t("gd.ctaGo")}</Link>
        </section>
      </div>
    </div>
  );
}
