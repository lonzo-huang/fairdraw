import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translate, useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { autoStripePayout, syncWisePayout } from "@/lib/payment.functions";
import { canonicalList, listHash, makeSeed, pickWinners, type Candidate } from "@/lib/draw";
import { computeProgress, parseConditions, type Metrics } from "@/lib/conditions";
import { Button } from "@/components/ui/button";
import { XAvatarDisc } from "@/components/x-avatar";
import { BadgeCheck, Check, CheckCircle2, ChevronRight, Copy, Crown, Eye, Heart, Link2, MessageCircle, MessageSquare, Play, Repeat2, Search, ShieldCheck, Users, XCircle } from "lucide-react";

const COND_LABEL = {
  min_likes: "cond.likes", min_replies: "cond.replies", min_reposts: "cond.reposts",
  min_quotes: "cond.quotes", min_views: "cond.views",
  min_participants: "cond.participants", min_verified: "cond.verified",
} as const;
const COND_CHIPS: { k: keyof typeof COND_LABEL | "keyword"; I: typeof Heart }[] = [
  { k: "min_likes", I: Heart }, { k: "min_replies", I: MessageCircle }, { k: "min_reposts", I: Repeat2 },
  { k: "min_quotes", I: MessageSquare }, { k: "min_views", I: Eye },
  { k: "min_participants", I: Users }, { k: "min_verified", I: BadgeCheck }, { k: "keyword", I: Search },
];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type StepState = "" | "run" | "ok" | "bad";
type PoState = "" | "done" | "now";

/** One-shot gold confetti burst on the fixed canvas (skipped for reduced motion). */
function burst(cv: HTMLCanvasElement | null) {
  if (!cv || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  const cx = cv.getContext("2d");
  if (!cx) return;
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const col = ["#f5b83d", "#ffd98a", "#7c5cff", "#3b82f6", "#34d399", "#fff1c9"];
  const ps = Array.from({ length: 120 }, () => ({ x: cv.width / 2, y: cv.height * 0.32, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4, r: Math.random() * 5 + 3, c: col[Math.floor(Math.random() * col.length)], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3 }));
  let f = 0;
  (function step() {
    cx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach((p) => {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a);
      cx.globalAlpha = Math.max(0, 1 - f / 110);
      cx.fillStyle = p.c ?? "#f5b83d"; cx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      cx.restore();
    });
    if (++f < 120) requestAnimationFrame(step); else cx.clearRect(0, 0, cv.width, cv.height);
  })();
}

export const Route = createFileRoute("/r/$slug")({
  head: () => ({
    meta: [
      { title: "Draw result — Verified with FairDraw" },
      { name: "description", content: "Public, re-computable giveaway result with payout proof." },
      { property: "og:title", content: "Draw result — Verified with FairDraw" },
      { property: "og:description", content: "Public, re-computable giveaway result with payout proof." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const { slug } = Route.useParams();
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/r/$slug/claim", params: { slug } })) return <Outlet />;
  return <ResultPageContent slug={slug} />;
}

function ResultPageContent({ slug }: { slug: string }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [steps, setSteps] = useState<[StepState, StepState, StepState]>(["", "", ""]);
  const [cmp, setCmp] = useState<{ ok1?: boolean; ok2?: boolean; ok3?: boolean | null }>({});
  const [pickLine, setPickLine] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<null | boolean>(null);
  const [running, setRunning] = useState(false);
  const [wName, setWName] = useState<string | null>(null);
  const [cq, setCq] = useState("");
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const revealed = useRef(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["result", slug],
    queryFn: async () => {
      const { data: c } = await supabase.from("campaigns").select("*").eq("slug", slug).maybeSingle();
      if (!c) return null;
      const [{ data: d }, { data: payouts }, { data: lastSnap }] = await Promise.all([
        supabase.from("draws").select("*").eq("campaign_id", c.id).maybeSingle(),
        supabase.from("payouts").select("*").eq("campaign_id", c.id),
        supabase.from("condition_snapshots").select("metrics").eq("campaign_id", c.id).order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { c, d, payouts: payouts ?? [], lastM: (lastSnap?.metrics ?? null) as Metrics | null };
    },
  });
  const { data: myHandles = [] } = useQuery({
    queryKey: ["my-entry-handles", data?.c?.id, user?.id],
    enabled: !!data?.c?.id && !!user,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("entries")
        .select("handle")
        .eq("campaign_id", data!.c!.id)
        .eq("user_id", user!.id);
      const handles = new Set((rows ?? []).map((r) => r.handle));
      // Reply-import entries carry user_id NULL — the OAuth-bound X handle is
      // the only link for most winners.
      const idt = (user!.identities ?? []).find((i) => i.provider === "x" || i.provider === "twitter");
      const raw = idt?.identity_data?.user_name ?? idt?.identity_data?.preferred_username ?? idt?.identity_data?.screen_name;
      if (typeof raw === "string" && raw.trim()) handles.add(raw.trim().replace(/^@/, ""));
      return [...handles].map((h) => h.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
    },
  });

  // Fire the committed transfer automatically whenever a signed-in visitor
  // sees a pending payout with a claimed account — Stripe transfers once the
  // capability is active; Wise transfers sync their delivery status.
  const autoPay = useServerFn(autoStripePayout);
  const wiseSync = useServerFn(syncWisePayout);
  useEffect(() => {
    if (!user) return;
    const p = data?.payouts?.find((x) => x.status !== "paid" && (x.stripe_account_id || x.wise_transfer_id));
    if (!p) return;
    const fn = p.wise_transfer_id ? wiseSync : autoPay;
    fn({ data: { payoutId: p.id } })
      .then((r) => { if (r?.paid) { toast.success(t("r.paid")); refetch(); } })
      .catch((e) => toast.error((e as Error).message));
  }, [user, data?.payouts, autoPay, wiseSync, refetch, t]);

  // Winner reveal: roll through candidate names once, then settle + confetti.
  useEffect(() => {
    if (!data?.d || revealed.current) return;
    revealed.current = true;
    const winners = (data.d.winners ?? []) as Candidate[];
    const cands = (data.d.candidates ?? []) as Candidate[];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => { setWName(winners[0]?.handle ?? null); if (winners.length) burst(confettiRef.current); };
    if (winners.length !== 1 || reduce || !cands.length) { finish(); return; }
    let n = 0;
    const tmr = setInterval(() => {
      setWName(cands[Math.floor(Math.random() * cands.length)]?.handle ?? null);
      if (++n > 18) { clearInterval(tmr); finish(); }
    }, 70);
    return () => clearInterval(tmr);
  }, [data?.d]);

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  if (!data) return <p className="p-10 text-center text-muted-foreground">404</p>;
  const { c, d, payouts } = data;
  if (!d)
    return (
      <div className="p-16 text-center">
        <p className="text-muted-foreground">{t("r.notYet")}</p>
        <Button asChild className="mt-4"><Link to="/c/$slug" params={{ slug }}>{c.title}</Link></Button>
      </div>
    );

  const winners = d.winners as Candidate[];
  const candidates = d.candidates as Candidate[];
  const weighted = c.draw_mode === "weighted";
  const dw = (c.draw_weights ?? null) as { blue?: number; normal?: number } | null;
  const drawnAt = new Date(d.drawn_at);
  const amt = c.prize_amount !== null ? `${c.prize_amount} ${c.currency}` : c.prize;
  const per = c.prize_amount !== null && winners.length ? Number((c.prize_amount / winners.length).toFixed(4)) : null;
  const winRate = candidates.length ? Math.round((winners.length / candidates.length) * 100) : 0;
  const author = data.lastM?.author_handle ?? null;
  const winSet = new Set(winners.map((w) => w.handle));
  const sortedCands = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const q = cq.trim().toLowerCase();
  const shownCands = sortedCands.filter((x) => !q || x.handle.toLowerCase().includes(q));
  const conditions = parseConditions(c.conditions);
  const condProg = data.lastM ? computeProgress(conditions, data.lastM) : null;
  const condState = new Map((condProg?.checks ?? []).map((ch) => [ch.key, ch.state]));
  const allPaid = payouts.length > 0 && payouts.every((p) => p.status === "paid");
  const allInfo = payouts.length > 0 && payouts.every((p) => p.claim_info || p.stripe_account_id || p.wise_transfer_id || p.status === "paid");
  const myPayout = payouts.find((p) => p.status !== "paid" && myHandles.includes((p.winner_handle ?? "").trim().toLowerCase().replace(/^@/, "")));
  const paidProofs = payouts.filter((p) => p.status === "paid" && p.proof);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const xText = translate(c.share_language === "en" ? "en" : "zh", "rs.xPost", {
    winners: winners.map((w) => `@${w.handle}`).join(" "), amt, n: candidates.length, url: `${origin}/r/${slug}`,
  });
  const poSteps: { t: string; s: string; st: PoState }[] = [
    { t: t("rs.stepDraw"), s: drawnAt.toLocaleDateString(), st: "done" },
    { t: t("rs.stepNotice"), s: `${winners.length} ${t("c.winners")}`, st: "done" },
    { t: t("rs.stepAddr"), s: allInfo ? t("rs.infoDone") : t("rs.waitInfo"), st: allInfo ? "done" : "now" },
    { t: t("rs.stepPaid"), s: allPaid ? t("r.paid") : t("rs.autoPay"), st: allPaid ? "done" : allInfo ? "now" : "" },
  ];

  async function verify() {
    if (!d || running) return;
    setRunning(true);
    setSteps(["run", "", ""]); setCmp({}); setPickLine(null); setVerdict(null);
    const hash = await listHash(candidates);
    await sleep(350);
    const ok1 = hash === d.list_hash;
    const seed = await makeSeed(hash, new Date(d.drawn_at).toISOString());
    setSteps([ok1 ? "ok" : "bad", "run", ""]);
    setCmp((v) => ({ ...v, ok1 }));
    await sleep(350);
    const ok2 = seed === d.seed;
    let ok3: boolean | null = null;
    if (!weighted) {
      // The draw reserves winners_count+3 picks so deleted replies can be
      // skipped — verify stored winners as an ordered subsequence of picks.
      const picks = await pickWinners(candidates, seed, winners.length + 3);
      let idx = 0; ok3 = true;
      for (const w of winners) {
        const j = picks.findIndex((p, i) => i >= idx && p.id === w.id);
        if (j < 0) { ok3 = false; break; }
        idx = j + 1;
      }
      const first = picks[0];
      const fi = first ? sortedCands.findIndex((x) => x.id === first.id) : -1;
      setPickLine(first && fi >= 0 ? `SHA-256(seed:0)[0..12] mod ${sortedCands.length} = ${fi} → 第 ${fi + 1} 位 @${first.handle}` : "—");
    }
    setSteps([ok1 ? "ok" : "bad", ok2 ? "ok" : "bad", weighted ? "" : ok3 ? "ok" : "bad"]);
    setCmp({ ok1, ok2, ok3 });
    setVerdict(ok1 && ok2 && (weighted || ok3 === true));
    setRunning(false);
  }

  const hashCode = (h: string) => <code><em>{h.slice(0, 8)}</em>{h.slice(8, -8)}<em>{h.slice(-8)}</em></code>;
  const copy = (v: string, msg?: string) => { navigator.clipboard.writeText(v).catch(() => {}); toast.success(msg ?? t("c.copied")); };

  return (
    <div className="page-rs mx-auto max-w-[880px] px-4 pb-20 pt-11 md:px-6">
      <article className="cert">
        <div className="cert-in">
          <div className="glow" />
          <div className="c-top">
            <span className="seal"><ShieldCheck />{t("rs.seal")}</span>
            <span className="cid">{t("rs.drawNo")} <b>#{d.seed.slice(0, 4).toUpperCase()}</b></span>
          </div>

          <div className="c-hero">
            <div className="c-eyebrow">{t("rs.eyebrow")}</div>
            <h1 className="c-title">{translate(lang, "ana.titleDrawn", { amt: "" })}<span className="amt">{amt}</span></h1>
            <div className="c-conds">
              {COND_CHIPS.filter(({ k }) => conditions[k] !== undefined).map(({ k, I }) => (
                <span key={k}><I />{k === "keyword" ? `${t("cond.keyword")} · ${conditions.keyword}` : `${t(COND_LABEL[k])} ≥ ${conditions[k]}`}{condState.get(k) === "met" ? " ✓" : ""}</span>
              ))}
            </div>

            {winners.length === 1 ? (
              <div className="winner">
                <div className="w-label">{t("rs.winnerLabel")}</div>
                <div className="w-av">
                  <span className="crown"><Crown /></span>
                  <span className="ring" />
                  <XAvatarDisc handle={winners[0]?.handle} className="face" />
                </div>
                <div className={`w-name${wName === winners[0]?.handle ? "" : " rolling"}`}>{wName ?? "—"}</div>
                <div className="w-handle">{t("rs.viewOnX")} <a href={`https://x.com/${winners[0]?.handle}`} target="_blank" rel="noopener noreferrer">@{winners[0]?.handle}</a></div>
                <div className="w-prize"><b>{per ?? amt}</b>{per !== null && <span>{c.currency}</span>}</div>
              </div>
            ) : (
              <div className="winner">
                <div className="w-label">{translate(lang, "rs.winnersLabel", { n: winners.length })}</div>
                <div className="w-list">
                  {winners.map((w) => (
                    <div key={w.id} className="w-row">
                      <XAvatarDisc handle={w.handle} className="av" />
                      <a className="h" href={`https://x.com/${w.handle}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>@{w.handle}</a>
                      <span className="p">{per !== null ? `${per} ${c.currency}` : amt}</span>
                    </div>
                  ))}
                </div>
                <div className="w-prize"><b>{amt}</b><span>{t("rs.poolLabel")}</span></div>
              </div>
            )}
          </div>

          <div className="perf" aria-hidden="true" />

          <div className="facts">
            <div className="fact"><div className="l">{t("rs.candidates")}</div><div className="v">{candidates.length}</div><div className="s">{t("rs.validReplies")}</div></div>
            <div className="fact"><div className="l">{t("rs.winnerCount")}</div><div className="v">{winners.length}</div><div className="s">{translate(lang, "rs.winRate", { p: winRate })}</div></div>
            <div className="fact"><div className="l">{t("rs.drawTime")}</div><div className="v">{drawnAt.toLocaleDateString()}</div><div className="s">{drawnAt.toLocaleTimeString()}</div></div>
            <div className="fact">
              <div className="l">{author ? t("rs.organizer") : t("rs.poolLabel")}</div>
              <div className="v" style={{ fontSize: 16, paddingTop: 3 }}>{author ? `@${author}` : amt}</div>
              <div className="s">{t("rs.escrowed")}</div>
            </div>
          </div>

          <div className="payout">
            <div className="po-h">
              <h3>{t("rs.payoutTitle")}</h3>
              <span className={`badge ${allPaid ? "b-ok" : "b-wait"}`}>{allPaid ? t("r.paid") : t("r.pending")}</span>
            </div>
            <div className="po-steps">
              {poSteps.map((s, i) => (
                <div key={i} className={`po-s ${s.st}`}>
                  <span className="d">{s.st === "done" ? <Check /> : i + 1}</span>
                  <div className="t">{s.t}</div>
                  <div className="s">{s.s}</div>
                </div>
              ))}
            </div>
            {paidProofs.map((p) => (
              <div key={p.id} className="tx">
                <Check />
                <span>{t("rs.txProof")} · @{p.winner_handle}</span>
                {/^https?:\/\//.test(p.proof ?? "") ? (
                  <><span className="mono">{p.proof}</span><a href={p.proof ?? "#"} target="_blank" rel="noopener noreferrer">{t("rs.viewProof")}</a></>
                ) : (
                  <span className="mono">{p.proof}</span>
                )}
              </div>
            ))}
            {myPayout && (
              <div className="claim">
                <p>{t("rs.stepAddr")}</p>
                <Link to="/r/$slug/claim" params={{ slug }} className="ghost">{t("win.claim")} →</Link>
              </div>
            )}
          </div>
        </div>
      </article>

      <div className="share">
        <button type="button" className="ghost" onClick={() => copy(`${origin}/r/${slug}`)}><Link2 />{t("rs.copyLink")}</button>
        <a className="ghost xbtn" href={`https://x.com/intent/tweet?text=${encodeURIComponent(xText)}`} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }} aria-hidden="true"><path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16Z"/></svg>
          {t("rs.xShare")}
        </a>
      </div>

      <section className="panel verify">
        <div className="v-h">
          <div>
            <h2>{t("rs.verifyTitle")}</h2>
            <p>{t("rs.verifyDesc")}</p>
          </div>
          <button type="button" className="vbtn" disabled={running} onClick={verify}>
            <Play />{verdict !== null ? t("rs.verifyAgain") : t("r.verify")}
          </button>
        </div>

        <ol className="chain">
          <li className={steps[0]}>
            <span className="k">{steps[0] === "ok" ? <Check /> : steps[0] === "bad" ? "✕" : "1"}</span>
            <div>
              <div className="st-t">{t("rs.step1T")}</div>
              <div className="st-f">{t("rs.step1F")}</div>
              <div className="hash">
                {hashCode(d.list_hash)}
                <button type="button" className="cp" aria-label="copy" onClick={() => copy(d.list_hash)}><Copy /></button>
              </div>
              <div className={`cmp ${cmp.ok1 === undefined ? "" : cmp.ok1 ? "ok" : "bad"}`}>
                {cmp.ok1 === undefined ? t("rs.step1Note") : cmp.ok1 ? translate(lang, "rs.cmpOk1", { n: candidates.length }) : t("rs.cmpBad1")}
              </div>
            </div>
          </li>
          <li className={steps[1]}>
            <span className="k">{steps[1] === "ok" ? <Check /> : steps[1] === "bad" ? "✕" : "2"}</span>
            <div>
              <div className="st-t">{t("rs.step2T")}</div>
              <div className="st-f">{t("rs.step2F")}</div>
              <div className="hash">
                {hashCode(d.seed)}
                <button type="button" className="cp" aria-label="copy" onClick={() => copy(d.seed)}><Copy /></button>
              </div>
              <div className={`cmp ${cmp.ok2 === undefined ? "" : cmp.ok2 ? "ok" : "bad"}`}>
                {cmp.ok2 === undefined ? <>{t("rs.drawTime")} <span className="mono">{new Date(d.drawn_at).toISOString()}</span></> : cmp.ok2 ? t("rs.cmpOk2") : t("rs.cmpBad2")}
              </div>
            </div>
          </li>
          <li className={steps[2]}>
            <span className="k">{steps[2] === "ok" ? <Check /> : steps[2] === "bad" ? "✕" : "3"}</span>
            <div>
              <div className="st-t">{t("rs.step3T")}</div>
              <div className="st-f">{t("rs.step3F")}</div>
              <div className="hash"><code>{pickLine ?? "—"}</code></div>
              <div className={`cmp ${cmp.ok3 == null ? "" : cmp.ok3 ? "ok" : "bad"}`}>
                {weighted
                  ? translate(lang, "rs.step3Weighted", { b: dw?.blue ?? 1, n: dw?.normal ?? 1 })
                  : cmp.ok3 == null ? t("rs.cmpWait3") : cmp.ok3 ? t("rs.cmpOk3") : t("rs.cmpBad3")}
              </div>
            </div>
          </li>
        </ol>

        {verdict !== null && (
          <div className={`result${verdict ? "" : " bad"}`}>
            {verdict ? <CheckCircle2 /> : <XCircle />}
            <div>
              <b>{verdict ? t("rs.resultOk") : t("rs.resultBad")}</b>
              <span>{verdict ? (weighted ? translate(lang, "rs.step3Weighted", { b: dw?.blue ?? 1, n: dw?.normal ?? 1 }) : t("rs.resultOkSub")) : t("rs.resultBadSub")}</span>
            </div>
          </div>
        )}

        <details className="cands">
          <summary>
            <ChevronRight />{t("rs.candList")}<span className="c">{candidates.length}</span><span className="r">{t("rs.candSort")}</span>
          </summary>
          <div className="c-tools">
            <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder={t("rs.candSearch")} aria-label={t("rs.candSearch")} />
            <button type="button" className="ghost" onClick={() => copy(canonicalList(candidates), t("rs.candCopied"))}><Copy />{t("rs.candCopy")}</button>
          </div>
          <div className="c-list">
            {shownCands.length ? shownCands.map((x, i) => (
              <div key={x.id} className={`c-row${winSet.has(x.handle) ? " win" : ""}`}>
                <span className="i">#{i + 1}</span>
                <span className="h">{x.id}:{x.handle}</span>
                {winSet.has(x.handle) ? <span className="tag">{t("rs.winTag")}</span> : <span />}
              </div>
            )) : (
              <div className="c-row"><span /><span className="h">{t("rs.candNone")}</span><span /></div>
            )}
          </div>
        </details>
      </section>
      <canvas ref={confettiRef} className="pointer-events-none fixed inset-0 z-40" />
    </div>
  );
}



