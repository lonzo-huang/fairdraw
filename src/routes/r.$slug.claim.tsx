import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { chainConfig, FIAT_CURRENCIES } from "@/lib/payments";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { claimChainPayout, claimStripePayout, claimWisePayout, getWiseClaimRequirements, submitPayoutInfo } from "@/lib/payment.functions";
import { CATALOG, FX, RECIPIENT_COUNTRIES, REGIONS, SYM, fit, valueIn, type WiseReq } from "@/lib/claim-data";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Check, CheckCircle2, Clock3, Crown, Gift, Landmark, Lock, MessageCircle, Search, ShieldCheck, Wallet } from "lucide-react";

const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TRON_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const MAIL_RE = /\S+@\S+\.\S+/;
const shortA = (a: string) => (a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const savedAddrKey = "fd-claim-addr";

type Metrics = { author_handle?: string | null };
type Payout = {
  id: string; winner_handle: string; status: string; proof: string | null;
  claim_info: string | null; stripe_account_id: string | null;
  wise_transfer_id: string | null; tx_hash: string | null;
  wallet_address: string | null; updated_at: string;
};
type Camp = {
  id: string; slug: string; title: string; prize: string;
  prize_amount: number | null; currency: string; winners_count: number;
  payment_method: string; escrow_status: string; tweet_url: string | null;
};
type Draw = { drawn_at: string; candidates: unknown; winners: unknown };
type Method = "chain" | "gift" | "stripe" | "wise" | "info";

export const Route = createFileRoute("/r/$slug/claim")({
  head: () => ({
    meta: [
      { title: "Claim your prize — FairDraw" },
      { name: "description", content: "Winner payout claim — submit your receiving details for a publicly verifiable prize." },
      { property: "og:title", content: "Claim your prize — FairDraw" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClaimPage,
});

function ClaimPage() {
  const { slug } = Route.useParams();
  const { t, lang } = useI18n();
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["claim", slug],
    queryFn: async () => {
      const { data: c } = await supabase.from("campaigns").select("*").eq("slug", slug).maybeSingle();
      if (!c) return null;
      const [{ data: d }, { data: payouts }, { data: lastSnap }] = await Promise.all([
        supabase.from("draws").select("*").eq("campaign_id", c.id).maybeSingle(),
        supabase.from("payouts").select("*").eq("campaign_id", c.id),
        supabase.from("condition_snapshots").select("metrics").eq("campaign_id", c.id).order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { c: c as Camp, d: d as Draw | null, payouts: (payouts ?? []) as Payout[], lastM: (lastSnap?.metrics ?? null) as Metrics | null };
    },
  });

  const { data: myHandles = [] } = useQuery({
    queryKey: ["claim-my-handles", data?.c?.id, user?.id],
    enabled: !!data?.c?.id && !!user,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("entries")
        .select("handle")
        .eq("campaign_id", data!.c.id)
        .eq("user_id", user!.id);
      const handles = new Set((rows ?? []).map((r) => r.handle));
      const idt = (user!.identities ?? []).find((i) => i.provider === "x" || i.provider === "twitter");
      const raw = idt?.identity_data?.user_name ?? idt?.identity_data?.preferred_username ?? idt?.identity_data?.screen_name;
      if (typeof raw === "string" && raw.trim()) handles.add(raw.trim().replace(/^@/, ""));
      return [...handles].map(norm).filter(Boolean);
    },
  });

  if (isLoading || authLoading) {
    return (
      <div className="page-claim mx-auto max-w-[980px] px-6 py-10">
        <Skeleton className="h-[150px] rounded-[26px]" />
        <Skeleton className="mt-5 h-16 rounded-[18px]" />
        <Skeleton className="mt-6 h-[420px] rounded-[22px]" />
      </div>
    );
  }

  if (!data?.c) {
    return (
      <div className="page-claim mx-auto flex max-w-[640px] flex-col items-center gap-4 px-6 py-24 text-center">
        <p className="text-muted-foreground">{t("cl.notFound")}</p>
        <Link to="/r/$slug" params={{ slug }} className="cl-ghost">{t("cl.visitorVerify")}</Link>
      </div>
    );
  }

  const { c, d, payouts, lastM } = data;
  const author = lastM?.author_handle ?? null;
  const winnerCount = c.winners_count || (Array.isArray(d?.winners) ? d.winners.length : 0) || 1;
  const share = c.prize_amount !== null && winnerCount > 0 ? c.prize_amount / winnerCount : null;
  const candCount = Array.isArray(d?.candidates) ? d.candidates.length : null;
  const drawnAt = d ? new Date(d.drawn_at) : null;
  const boundRaw = (user?.identities ?? []).find((i) => i.provider === "x" || i.provider === "twitter")?.identity_data;
  const boundHandle = (boundRaw?.user_name ?? boundRaw?.preferred_username ?? boundRaw?.screen_name ?? null) as string | null;

  const myPayout = payouts.find((p) => myHandles.includes(norm(p.winner_handle ?? "")));
  const paid = myPayout?.status === "paid";
  // Real payout mechanism initiated (irreversible): stripe onboarding, wise transfer, on-chain tx, or status=paying.
  // claim_info alone is just a note — the user should still be able to pick a proper payout method.
  const payoutStarted = !!myPayout && !paid && (
    myPayout.status === "paying" ||
    !!myPayout.stripe_account_id ||
    !!myPayout.wise_transfer_id ||
    !!myPayout.tx_hash
  );
  // For step indicator: any info at all (including a plain note) marks step 3 as touched.
  const hasAnyInfo = !!myPayout && (!!myPayout.claim_info || !!myPayout.stripe_account_id || !!myPayout.wise_transfer_id || !!myPayout.tx_hash);

  const view: "signin" | "wait" | "visitor" | "sent" | "claim" =
    !user ? "signin"
    : !d || payouts.length === 0 ? "wait"
    : !myPayout ? "visitor"
    : paid || payoutStarted ? "sent"
    : "claim";

  return (
    <div className="page-claim">
      <main className="cl-wrap">
        <section className="cl-hero">
          <div className="cl-hero-in">
            <div className="cl-wav">
              <span className="crown"><Crown /></span>
              <span className="ring" />
              <span className="face">{norm(myPayout?.winner_handle ?? boundHandle ?? "?").slice(0, 1).toUpperCase() || "?"}</span>
            </div>
            <div className="cl-hmid">
              <div className="ey">{view === "visitor" || view === "signin" || view === "wait" ? t("cl.eyResult") : t("cl.ey")}</div>
              <h1>{view === "claim" || view === "sent" ? t("cl.heroWon", { h: `@${myPayout!.winner_handle}` }) : t("cl.heroResult")}</h1>
              <p>
                {author && <>{t("cl.heroFrom")} <b>@{author}</b> · </>}
                「{c.title}」
                {drawnAt && <> · {t("cl.heroDrawn", { date: drawnAt.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-GB", { month: "short", day: "numeric" }), n: String(candCount ?? "—") })}</>}
                {" · "}<Link to="/r/$slug" params={{ slug }}>{t("cl.verify")}</Link>
              </p>
            </div>
            <div className="cl-hprize">
              <div className="l">{c.payment_method === "chain" ? t("cl.prize") : t("cl.prizeVal")}</div>
              <div className="v">{share !== null ? share : c.prize}<small>{share !== null ? c.currency : ""}</small></div>
              <div className="s">{c.payment_method === "chain" ? t("cl.chainSub") : t("cl.fundSub")}</div>
            </div>
          </div>
        </section>

        {d && (
          <div className="cl-steps">
            {[
              { tt: t("rs.stepDraw"), s: drawnAt ? drawnAt.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-GB", { month: "short", day: "numeric" }) : "—", done: true },
              { tt: t("rs.stepNotice"), s: t("cl.stepNotified"), done: true },
              { tt: t("rs.stepAddr"), s: hasAnyInfo || paid ? t("rs.infoDone") : t("cl.stepNow"), done: hasAnyInfo || paid },
              { tt: t("rs.stepPaid"), s: paid ? t("r.paid") : t("rs.autoPay"), done: paid },
            ].map((s2, i, arr) => (
              <div key={i} className={`cl-sp${s2.done ? " done" : i === arr.findIndex((x) => !x.done) ? " now" : ""}`}>
                <span className="d">{s2.done ? <Check /> : i + 1}</span>
                <div className="tt">{s2.tt}</div>
                <div className="s">{s2.s}</div>
              </div>
            ))}
          </div>
        )}

        {view === "claim" && myPayout && (
          <ClaimView c={c} p={myPayout} share={share} boundHandle={boundHandle} email={user?.email ?? ""} onDone={refetch} />
        )}
        {view === "sent" && myPayout && <SentView c={c} p={myPayout} share={share} paid={paid} />}
        {(view === "visitor" || view === "wait") && (
          <section className="cl-panel cl-visit">
            <Lock />
            <div><b>{t("cl.visitorT")}</b><span>{t(view === "wait" ? "cl.waitP" : "cl.visitorP")}</span></div>
            <Link to="/r/$slug" params={{ slug }} className="cl-ghost">{t("cl.visitorVerify")}</Link>
          </section>
        )}
        {view === "signin" && (
          <section className="cl-panel cl-visit">
            <Lock />
            <div><b>{t("cl.signinT")}</b><span>{t("cl.signinP")}</span></div>
            <Link to="/auth" className="cl-ghost">{t("cl.signinBtn")}</Link>
          </section>
        )}

        <section className="cl-panel cl-verify">
          <ShieldCheck />
          <div><b>{t("cl.verifyT")}</b><span>{t("cl.verifyP")}</span></div>
          <Link to="/r/$slug" params={{ slug }} className="cl-ghost">{t("cl.verifyLink")}</Link>
        </section>
      </main>
    </div>
  );
}

/* ── pending-claim view ─────────────────────────────────────────────────── */

function ClaimView({ c, p, share, boundHandle, email, onDone }: { c: Camp; p: Payout; share: number | null; boundHandle: string | null; email: string; onDone: () => void }) {
  const { t } = useI18n();
  const isToken = c.currency.toUpperCase() === chainConfig().tokenSymbol;
  const funded = c.escrow_status === "funded" || c.escrow_status === "charged";

  const methods: { k: Method; I: typeof Wallet; tt: string; s: string; tag: "g" | "w" | "" }[] = [];
  if (isToken) {
    // USDT pays out on-chain only (cl.b3p.chain). Keep a manual fallback
    // for pools that aren't escrow-funded so methods is never empty.
    if (c.payment_method === "chain" && funded) methods.push({ k: "chain", I: Wallet, tt: t("cl.mChain"), s: t("cl.mChainS"), tag: "g" });
    else methods.push({ k: "info", I: MessageCircle, tt: t("cl.mInfo"), s: t("cl.mInfoS"), tag: "w" });
  } else if (c.payment_method === "stripe") {
    if (share !== null) methods.push({ k: "gift", I: Gift, tt: t("cl.mGift"), s: t("cl.mGiftS"), tag: "w" });
  } else {
    if (share !== null) methods.push({ k: "gift", I: Gift, tt: t("cl.mGift"), s: t("cl.mGiftS"), tag: "w" });
    methods.push({ k: "info", I: MessageCircle, tt: t("cl.mInfo"), s: t("cl.mInfoS"), tag: "" });
  }

  const [method, setMethod] = useState<Method>(methods[0]?.k ?? "info");
  const m = methods.find((x) => x.k === method) ?? methods[0];

  return (
    <div className="cl-grid">
      <div className="cl-panel">
        <div className="cl-blk">
          <div className="cl-blkh"><span className="n ok"><Check /></span><div><h2>{t("cl.b1")}</h2></div></div>
          <div className="cl-ident">
            <span className="x"><svg viewBox="0 0 24 24" fill="#fff" width="13" height="13"><path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16Z"/></svg></span>
            <div><b>@{p.winner_handle}</b><br /><span>{boundHandle ? `${t("cl.xVerified")}${email ? ` · ${email}` : ""}` : t("cl.xNoBind")}</span></div>
            <span className="ck"><CheckCircle2 />{boundHandle ? t("cl.xMatch") : t("cl.xEntry")}</span>
          </div>
        </div>

        <div className="cl-blk">
          <div className="cl-blkh"><span className="n">2</span><div><h2>{t("cl.b2")}</h2><p>{t("cl.b2p")}</p></div></div>
          <div className="cl-fund">
            <span className="ic" style={{ background: isToken ? "#26a17b" : "#635bff" }}>{isToken ? "₮" : "S"}</span>
            <div>
              <b>{share !== null ? `${share} ${c.currency}` : c.prize}</b><br />
              <span>{isToken ? t("cl.fundChain") : c.payment_method === "stripe" ? t("cl.fundStripe") : t("cl.fundManual")}</span>
            </div>
            {m.tag && <span className={`tg ${m.tag}`}>{m.tag === "g" ? t("cl.tagFast") : t("cl.tagManual")}</span>}
          </div>
          {methods.length > 1 && (
            <div className="cl-meth">
              {methods.map((x) => (
                <button key={x.k} type="button" className="cl-mo" role="radio" aria-checked={x.k === m.k} onClick={() => setMethod(x.k)}>
                  <span className="lg"><x.I /></span>
                  <span><b>{x.tt}</b><span>{x.s}</span></span>
                  <span className="radio" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="cl-blk">
          <div className="cl-blkh"><span className="n">3</span><div><h2>{t(`cl.b3.${m.k}` as "cl.b3.chain")}</h2><p>{t(`cl.b3p.${m.k}` as "cl.b3p.chain")}</p></div></div>
          {m.k === "chain" && <ChainForm p={p} share={share} onDone={onDone} />}
          {m.k === "gift" && share !== null && <GiftForm p={p} share={share} currency={c.currency} email={email} onDone={onDone} />}
          {m.k === "stripe" && <StripeForm p={p} onDone={onDone} />}
          {m.k === "wise" && <WiseForm p={p} currency={c.currency} onDone={onDone} />}
          {m.k === "info" && <InfoForm p={p} claimInfo={p.claim_info} onDone={onDone} />}
        </div>
      </div>

      <aside className="cl-side">
        <SideSummary c={c} p={p} share={share} method={m.k} />
        <div className="cl-panel cl-trust"><ShieldCheck /><div>{m.k === "chain" ? t("cl.trustChain") : m.k === "gift" ? t("cl.trustGift") : t("cl.trustInfo")}</div></div>
      </aside>
    </div>
  );
}

/** Read-only summary of the pending claim; submission happens in the form. */
function SideSummary({ c, p, share, method }: { c: Camp; p: Payout; share: number | null; method: Method }) {
  const { t } = useI18n();
  const rows: [string, string, boolean?][] = [
    [t("cl.sumPrize"), share !== null ? `${share.toFixed(2)} ${c.currency}` : c.prize],
    [t("cl.sumMethod"), t(`cl.b3.${method}` as "cl.b3.chain"), true],
    ...(method === "chain" ? [[t("cl.sumNet"), "BEP20", true] as [string, string, boolean], [t("cl.sumFee"), t("cl.sumFeeVal")] as [string, string]] : []),
  ];
  return (
    <div className="cl-panel cl-sum">
      <h3>{t("cl.sum")}</h3>
      <dl>{rows.map(([k, v, s], i) => <div key={i}><dt>{k}</dt><dd className={s ? "s" : ""}>{v}</dd></div>)}</dl>
      <div className="tot"><span>{t("cl.youGet")}</span><b>{share !== null ? `${share.toFixed(2)}` : c.prize}<small>{share !== null ? c.currency : ""}</small></b></div>
      <div className="to">@{p.winner_handle}</div>
      <div className="need"><Clock3 />{t("cl.sumHint")}</div>
    </div>
  );
}

/* ── chain wallet ───────────────────────────────────────────────────────── */

function ChainForm({ p, share, onDone }: { p: Payout; share: number | null; onDone: () => void }) {
  const { t } = useI18n();
  const claim = useServerFn(claimChainPayout);
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [save, setSave] = useState(true);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => { setLast(typeof window !== "undefined" ? window.localStorage.getItem(savedAddrKey) : null); }, []);

  const v = addr.trim();
  const valid = ADDR_RE.test(v);
  const msg = !v ? { cls: "", txt: t("cl.addrHint") }
    : valid ? { cls: "ok", txt: t("cl.addrOk") }
    : TRON_RE.test(v) ? { cls: "err", txt: t("cl.addrTron") }
    : v.length >= 42 || !/^0x[0-9a-fA-F]*$/.test(v) ? { cls: "err", txt: t("cl.addrBad") }
    : { cls: "", txt: t("cl.addrLen", { n: String(v.length) }) };

  async function go() {
    setBusy(true);
    try {
      await claim({ data: { payoutId: p.id, address: v } });
      if (save && typeof window !== "undefined") window.localStorage.setItem(savedAddrKey, v);
      toast.success(t("r.chainSent"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      {last && last !== v && (
        <div className="cl-saved">{t("cl.addrLast")} <code>{shortA(last)}</code><button type="button" onClick={() => setAddr(last)}>{t("cl.addrUse")}</button></div>
      )}
      <div className="cl-fld">
        <label>{t("cl.addrL")} <span className="chain">BNB Smart Chain · BEP20</span></label>
        <input className={`cl-in mono${msg.cls === "err" ? " bad" : msg.cls === "ok" ? " good" : ""}`} value={addr} maxLength={42} spellCheck={false} autoComplete="off" placeholder="0x…" onChange={(e) => setAddr(e.target.value)} />
        <div className={`msg ${msg.cls}`}>{msg.txt}</div>
      </div>
      <div className="cl-warn"><AlertTriangle /><div>{t("cl.addrWarn")}</div></div>
      <label className="cl-chk"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />{t("cl.addrSave")}</label>
      <button className="cl-btn" disabled={busy || !valid} onClick={go}>{busy ? t("cl.submitting") : t("cl.submitChain", { amt: share !== null ? String(share) : "" })}</button>
    </div>
  );
}

/* ── gift card ──────────────────────────────────────────────────────────── */

function GiftForm({ p, share, currency, email, onDone }: { p: Payout; share: number; currency: string; email: string; onDone: () => void }) {
  const { t, lang } = useI18n();
  const submit = useServerFn(submitPayoutInfo);
  const [region, setRegion] = useState("CN");
  const [card, setCard] = useState<string | null>(null);
  const [cat, setCat] = useState("__all__");
  const [q, setQ] = useState("");
  const [mail, setMail] = useState(email);
  const [busy, setBusy] = useState(false);

  const reg = REGIONS.find((r) => r.k === region) ?? REGIONS[0];
  const cur = reg.cur;
  const v = valueIn(share, currency, cur);
  const list = (CATALOG[region] ?? [])
    .map((x) => ({ ...x, f: fit(x, v, cur, lang) }))
    .filter((x) => (cat === "__all__" || x.c === cat) && (!q || x.n.toLowerCase().includes(q) || x.nEn.toLowerCase().includes(q) || x.ab.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.f.ok) - Number(a.f.ok));
  const cats = [...new Set((CATALOG[region] ?? []).map((x) => x.c))];
  const sel = list.find((x) => x.id === card) ?? (CATALOG[region] ?? []).find((x) => x.id === card);
  const mailOk = MAIL_RE.test(mail.trim());
  const canSubmit = !!sel?.f.ok && mailOk;

  async function go() {
    if (!sel) return;
    setBusy(true);
    try {
      const rn = lang === "zh" ? reg.n : reg.nEn;
      const cn = lang === "zh" ? sel.n : sel.nEn;
      const info = `${lang === "zh" ? "礼品卡" : "Gift card"} · ${rn} · ${cn} (${SYM[cur]}${(sel.f.face ?? v).toFixed(sel.fixed ? 0 : 2)}) → ${mail.trim()}`;
      await submit({ data: { payoutId: p.id, info } });
      toast.success(t("r.claimInfoSaved"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="cl-region" role="radiogroup" aria-label={t("cl.regionT")}>
        {REGIONS.map((r) => (
          <button key={r.k} type="button" className="cl-rg" role="radio" aria-checked={r.k === region} onClick={() => { setRegion(r.k); setCard(null); setCat("__all__"); }}>
            {lang === "zh" ? r.n : r.nEn} <small>≈ {SYM[r.cur]}{valueIn(share, currency, r.cur).toFixed(2)}</small>
          </button>
        ))}
      </div>
      <div className="rate">{t("cl.rateNote", { usd: FX.USD })}</div>

      <label className="cl-gsearch"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cl.giftSearch")} /></label>
      <div className="cl-gcat">
        <button type="button" aria-pressed={cat === "__all__"} onClick={() => setCat("__all__")}>{t("cl.giftAll")}</button>
        {cats.map((x) => <button key={x} type="button" aria-pressed={cat === x} onClick={() => setCat(x)}>{x}</button>)}
      </div>
      <div className="cl-gg" role="radiogroup">
        {list.length ? list.map((x) => (
          <button key={x.id} type="button" className="cl-gc" role="radio" aria-checked={card === x.id} disabled={!x.f.ok} onClick={() => setCard(x.id)}>
            <span className="ck"><Check /></span>
            <div className="art" style={{ background: x.bg }}>{x.ab}<i>{x.f.ok ? `${SYM[cur]}${(x.f.face ?? 0).toFixed(x.fixed ? 0 : 2)}` : ""}</i></div>
            <div className="bd"><div className="nm">{lang === "zh" ? x.n : x.nEn}</div><div className={`mt${x.f.ok ? "" : " bad"}`}>{x.f.note}</div></div>
          </button>
        )) : <p className="cl-gnote" style={{ gridColumn: "1/-1" }}>{t("cl.giftNone")}</p>}
      </div>

      <div className="cl-fld" style={{ marginTop: 16 }}>
        <label>{t("cl.giftEmail")} <span>{t("cl.giftEmailHint")}</span></label>
        <input className="cl-in" type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
      </div>
      <p className="cl-gnote">{t("cl.giftNote")}</p>
      <button className="cl-btn" disabled={busy || !canSubmit} onClick={go}>
        {busy ? t("cl.submitting") : sel ? t("cl.submitGift", { card: lang === "zh" ? sel.n : sel.nEn }) : t("cl.submitGiftNone")}
      </button>
      <div className="cl-need">{!sel ? t("cl.needCard") : !mailOk ? t("cl.needMail") : t("cl.cardEta")}</div>
    </div>
  );
}

/* ── stripe connect ─────────────────────────────────────────────────────── */

function StripeForm({ p, onDone }: { p: Payout; onDone: () => void }) {
  const { t } = useI18n();
  const claim = useServerFn(claimStripePayout);
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const onboarded = !!p.stripe_account_id;

  async function go() {
    setBusy(true);
    try {
      const r = await claim({ data: { payoutId: p.id, origin: window.location.origin, ...(onboarded ? {} : { country }) } });
      if (r.url) { window.location.href = r.url; return; }
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      {!onboarded && (
        <div className="cl-fld">
          <label>{t("r.claimCountry")} <span>{t("cl.stripeCountryHint")}</span></label>
          <select className="cl-in" value={country} onChange={(e) => setCountry(e.target.value)} aria-label={t("r.claimCountry")}>
            <option value="">{t("r.claimCountry")}</option>
            {RECIPIENT_COUNTRIES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
          </select>
        </div>
      )}
      {onboarded && <p className="cl-gnote">{t("r.claimedInfo")}</p>}
      <button className="cl-btn" disabled={busy || (!onboarded && !country)} onClick={go}>
        {busy ? t("cl.submitting") : onboarded ? t("r.claimAgain") : t("cl.stripeGo")}
      </button>
      {!onboarded && <div className="cl-need">{t("cl.stripeNeed")}</div>}
    </div>
  );
}

/* ── wise transfer ──────────────────────────────────────────────────────── */

function WiseForm({ p, currency, onDone }: { p: Payout; currency: string; onDone: () => void }) {
  const { t } = useI18n();
  const getReqs = useServerFn(getWiseClaimRequirements);
  const claim = useServerFn(claimWisePayout);
  const [holder, setHolder] = useState("");
  const [rtype, setRtype] = useState("");
  const [dets, setDets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isToken = currency.toUpperCase() === chainConfig().tokenSymbol;
  const [fiat, setFiat] = useState("CNY");
  const target = isToken ? fiat : currency;
  const { data: reqs } = useQuery({ queryKey: ["wise-reqs", target], queryFn: () => getReqs({ data: { targetCurrency: target } }) });
  const types = (reqs ?? []) as WiseReq[];
  const sel = types.find((r) => r.type === rtype) ?? types[0];
  const groups = (sel?.fields ?? []).flatMap((f) => f.group ?? []).filter((g) => g.key !== "accountHolderName");

  async function go() {
    if (!sel) return;
    setBusy(true);
    try {
      await claim({ data: { payoutId: p.id, recipientType: sel.type, accountHolderName: holder, details: dets, ...(isToken ? { targetCurrency: target } : {}) } });
      toast.success(t("r.wiseSent"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="cl-fld">
        {isToken && (
          <>
            <label>{t("r.fiatCurrency")}</label>
            <select className="cl-in" value={fiat} onChange={(e) => { setFiat(e.target.value); setRtype(""); setDets({}); }}>
              {[...FIAT_CURRENCIES].map((fc) => <option key={fc} value={fc}>{fc}</option>)}
            </select>
          </>
        )}
      </div>
      <div className="cl-fld">
        <label>{t("r.wiseHolder")}</label>
        <input className="cl-in" value={holder} onChange={(e) => setHolder(e.target.value)} />
      </div>
      <div className="cl-fld">
        <label>{t("r.wiseType")}</label>
        <select className="cl-in" value={sel?.type ?? ""} onChange={(e) => { setRtype(e.target.value); setDets({}); }}>
          {types.map((r) => <option key={r.type} value={r.type}>{r.title || r.type}</option>)}
        </select>
      </div>
      {groups.map((g) => (
        <div className="cl-fld" key={g.key}>
          <label>{g.name ?? g.key}</label>
          {g.valuesAllowed?.length ? (
            <select className="cl-in" value={dets[g.key] ?? ""} onChange={(e) => setDets((d) => ({ ...d, [g.key]: e.target.value }))}>
              <option value="">{g.name ?? g.key}</option>
              {g.valuesAllowed.map((vv) => <option key={vv.key} value={vv.key}>{vv.name}</option>)}
            </select>
          ) : (
            <input className="cl-in" value={dets[g.key] ?? ""} onChange={(e) => setDets((d) => ({ ...d, [g.key]: e.target.value }))} />
          )}
        </div>
      ))}
      <button className="cl-btn" disabled={busy || !sel || !holder.trim() || groups.some((g) => !(dets[g.key] ?? "").trim())} onClick={go}>
        {busy ? t("cl.submitting") : t("r.claimWise")}
      </button>
    </div>
  );
}

/* ── manual info ────────────────────────────────────────────────────────── */

function InfoForm({ p, claimInfo, onDone }: { p: Payout; claimInfo: string | null; onDone: () => void }) {
  const { t } = useI18n();
  const submit = useServerFn(submitPayoutInfo);
  const [info, setInfo] = useState(claimInfo ?? "");
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await submit({ data: { payoutId: p.id, info } });
      toast.success(t("r.claimInfoSaved"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="cl-fld">
        <label>{t("cl.infoL")} <span>{t("cl.infoHint")}</span></label>
        <input className="cl-in" value={info} maxLength={200} onChange={(e) => setInfo(e.target.value)} placeholder={t("r.claimInfoPlaceholder")} />
      </div>
      <button className="cl-btn" disabled={busy || !info.trim()} onClick={go}>{busy ? t("cl.submitting") : t("r.claimInfoSubmit")}</button>
    </div>
  );
}

/* ── claimed / processing view ──────────────────────────────────────────── */

function SentView({ c, p, share, paid }: { c: Camp; p: Payout; share: number | null; paid: boolean }) {
  const { t } = useI18n();
  const isChain = !!p.tx_hash || (p.claim_info ?? "").includes("→ 0x");
  const cfg = chainConfig();
  const txUrl = p.tx_hash ? `https://bscscan.com/tx/${p.tx_hash}` : null;
  const isGift = (p.claim_info ?? "").startsWith("礼品卡") || (p.claim_info ?? "").startsWith("Gift card");

  return (
    <section className="cl-panel cl-done">
      <div className={`ic${isGift ? " gold" : ""}`}>{isGift ? <Gift /> : <Check />}</div>
      {!paid ? (
        <>
          <h2>{t("cl.processing")}</h2>
          <p>{t("cl.processingP")}</p>
          {p.claim_info && <div className="tx"><span>{t("cl.sumMethod")}</span><code>{p.claim_info}</code></div>}
        </>
      ) : isChain ? (
        <>
          <h2>{t("cl.sentChainT", { amt: share !== null ? `${share.toFixed(2)} ${c.currency}` : c.prize })}</h2>
          <p>{t("cl.sentChainP", { addr: p.wallet_address ? shortA(p.wallet_address) : "" })}</p>
          {p.tx_hash && (
            <div className="tx"><span>{t("cl.txHash")}</span><code>{p.tx_hash}</code><a href={txUrl ?? "#"} target="_blank" rel="noopener noreferrer">BscScan ↗</a></div>
          )}
        </>
      ) : isGift ? (
        <>
          <h2>{t("cl.sentGiftT")}</h2>
          <p>{t("cl.sentGiftP")}</p>
          <div className="tx"><span>{t("cl.sumMethod")}</span><code>{p.claim_info}</code></div>
        </>
      ) : (
        <>
          <h2>{t("cl.sentBankT")}</h2>
          <p>{t("cl.sentBankP")}</p>
          {p.claim_info && <div className="tx"><span>{t("cl.sumMethod")}</span><code>{p.claim_info}</code></div>}
        </>
      )}
      <div className="acts">
        <Link to="/dashboard" className="cl-ghost">{t("cl.sentMyWins")}</Link>
        <a
          className="cl-ghost"
          target="_blank"
          rel="noopener noreferrer"
          href={`https://x.com/intent/tweet?text=${encodeURIComponent(`我在 @${p.winner_handle} 参与的抽奖中奖了 🎉 开奖过程完全公开可验证 👉 ${typeof window !== "undefined" ? window.location.origin : ""}/r/${c.slug}`)}`}
        >{t("cl.sentShare")}</a>
      </div>
    </section>
  );
}
