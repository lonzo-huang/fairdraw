import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type DictKey } from "@/lib/i18n";
import { type Conditions } from "@/lib/conditions";
import { campaignTweet, prizeSummary, type ShareCampaign } from "@/lib/campaign-share";
import { renderShareImage } from "@/lib/campaign-share-image";
import {
  cardData,
  tweetBody,
  replyText,
  altText,
  tweetLen,
  type CardGoal,
  type CardData,
} from "@/lib/campaign-texts";
import {
  renderCampaignCard,
  campaignCardBlob,
  CARD_SIZES,
  type CardSize,
  type CardTheme,
} from "@/lib/campaign-card";
import { xPublishStatus, publishCampaignTweet } from "@/lib/xpublish.functions";
import {
  BadgeCheck,
  BarChart3,
  Bookmark,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Heart,
  ImageDown,
  MessageCircle,
  MessageSquare,
  Repeat2,
  Send,
  Share,
  Users,
} from "lucide-react";
import { CURRENCIES, DURATIONS, endsAtFromDays } from "@/lib/plans";
import { chainConfig, stripeSupports } from "@/lib/payments";
import { feeAmount } from "@/lib/fees";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
import { startStripeCheckout } from "@/lib/payment.functions";
import { ChainFundingBody, type FundingCampaign } from "@/components/funding-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({
    meta: [
      { title: "New campaign — FairDraw" },
      { name: "description", content: "Create a verifiable FairDraw community giveaway." },
      { property: "og:title", content: "New campaign — FairDraw" },
      { property: "og:description", content: "Create a verifiable FairDraw community giveaway." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewCampaign,
});

type Created = ShareCampaign & { id: string; ends_at: string; payment_method: string };

/** Selectable metric conditions: checkbox + ≥ threshold input, replies locked, max 4 picked. */
const METRIC_KEYS = [
  "min_likes",
  "min_replies",
  "min_reposts",
  "min_quotes",
  "min_views",
  "min_participants",
  "min_verified",
] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
const METRIC_LABEL: Record<
  MetricKey,
  | "cond.likes"
  | "cond.replies"
  | "cond.reposts"
  | "cond.quotes"
  | "cond.views"
  | "cond.participants"
  | "cond.verified"
> = {
  min_likes: "cond.likes",
  min_replies: "cond.replies",
  min_reposts: "cond.reposts",
  min_quotes: "cond.quotes",
  min_views: "cond.views",
  min_participants: "cond.participants",
  min_verified: "cond.verified",
};
const METRIC_GOAL: Record<MetricKey, { zh: string; en: string; ppl?: boolean }> = {
  min_likes: { zh: "点赞", en: "likes" },
  min_replies: { zh: "回复", en: "replies" },
  min_reposts: { zh: "转贴", en: "reposts" },
  min_quotes: { zh: "引用", en: "quotes" },
  min_views: { zh: "曝光", en: "views" },
  min_participants: { zh: "参与人数", en: "participants", ppl: true },
  min_verified: { zh: "蓝V参与", en: "verified participants", ppl: true },
};
const MAX_CONDITIONS = 4;
const PRESET_AMOUNTS = [10, 50, 100, 500, 1000];
const METRIC_ICON: Record<MetricKey, React.ElementType> = {
  min_likes: Heart,
  min_replies: MessageCircle,
  min_reposts: Repeat2,
  min_quotes: MessageSquare,
  min_views: Eye,
  min_participants: Users,
  min_verified: BadgeCheck,
};
const X_LOGO = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16Z" />
  </svg>
);
const TONES = ["f.tone0", "f.tone1", "f.tone2", "f.tone3"] as const;
const THEME_SWATCH: Record<CardTheme, string> = {
  gold: "linear-gradient(135deg,#0b1020,#f5b83d)",
  neon: "linear-gradient(135deg,#1b0f3f,#ff4f8b)",
  light: "linear-gradient(135deg,#fff6e6,#ff8a3d)",
};

function NewCampaign() {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  /** Draft row: created lazily so the card QR gets a real /c/{slug}. */
  const [row, setRow] = useState<Created | null>(null);
  /** Confirmed = payment flow started → form locks until "modify". */
  const [confirmed, setConfirmed] = useState(false);
  const [funded, setFunded] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [prizeTouched, setPrizeTouched] = useState(false);
  const [poster, setPoster] = useState<{
    name: string;
    handle: string;
    avatar: string | null;
  } | null>(null);
  const [f, setF] = useState({
    title: "",
    prize: "",
    prize_amount: "",
    currency: "USDT",
    winners_count: 1,
    days: "1",
    requirement: "",
    tweet_url: "",
    keyword: "",
  });
  const [sel, setSel] = useState<Partial<Record<MetricKey, boolean>>>({ min_replies: true });
  const [vals, setVals] = useState<Record<MetricKey, string>>(
    () => Object.fromEntries(METRIC_KEYS.map((k) => [k, "100"])) as Record<MetricKey, string>,
  );
  const [condErr, setCondErr] = useState("");
  const [payMethod, setPayMethod] = useState<"stripe" | "chain">("chain");
  const [editing, setEditing] = useState(false);
  const [showStripeNote, setShowStripeNote] = useState(false);
  const { data: fees = [] } = useFeeTiers();
  const checkout = useServerFn(startStripeCheckout);
  const getXStatus = useServerFn(xPublishStatus);
  const publishX = useServerFn(publishCampaignTweet);
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });

  const amount = f.prize_amount ? Number(f.prize_amount) : null;
  const winners = Math.max(1, Number(f.winners_count) || 1);
  const selKeys = METRIC_KEYS.filter((k) => sel[k]);

  function toggle(k: MetricKey) {
    if (k === "min_replies") {
      setCondErr(t("cond.lockErr"));
      return;
    }
    if (!sel[k] && selKeys.length >= MAX_CONDITIONS) {
      setCondErr(t("cond.maxErr"));
      return;
    }
    setCondErr("");
    setSel({ ...sel, [k]: !sel[k] });
  }

  const conditions: Conditions = {};
  if (f.keyword.trim()) conditions.keyword = f.keyword.trim();
  for (const k of selKeys) {
    const n = Math.floor(Number(vals[k]));
    if (n > 0) conditions[k] = n;
  }

  const stripeOk = stripeSupports(f.currency);
  const chainOk = f.currency === "USDT" || f.currency === "USDC";
  const effMethod: "stripe" | "chain" =
    payMethod === "stripe" && !stripeOk && chainOk ? "chain" : payMethod;
  const canPay = (effMethod === "stripe" && stripeOk) || (effMethod === "chain" && chainOk);
  /** Online payment → the prize is delivered as a gift card; texts/card switch wording. */
  const crypto = effMethod === "chain";

  const shareBase: ShareCampaign = {
    title: "",
    slug: "preview",
    prize: "",
    prize_amount: amount,
    currency: crypto ? f.currency : "USD",
    winners_count: winners,
    share_language: lang,
    share_duration: f.days === "1h" ? 1 : Number(f.days),
    conditions,
    requirement: f.requirement,
    share_hours: f.days === "1h" ? 1 : Number(f.days) * 24,
  };

  // Prize description and title auto-generate until the user edits them by hand.
  const autoPrize =
    amount && amount > 0
      ? crypto
        ? prizeSummary({ ...shareBase, prize: f.prize })
        : lang === "zh"
          ? `🎁 奖品：${winners} 位中奖者，每人 $${(amount / winners).toFixed(2)} 礼品卡`
          : `🎁 Prize: ${winners} winner(s), $${(amount / winners).toFixed(2)} gift card each`
      : "";
  const prizeText = prizeTouched ? f.prize : autoPrize;

  const COND_SHORT_ZH: Record<MetricKey, string> = {
    min_likes: "赞",
    min_replies: "回复",
    min_reposts: "转发",
    min_quotes: "引用",
    min_views: "曝光",
    min_participants: "参与者",
    min_verified: "蓝V",
  };
  const COND_SHORT_EN: Record<MetricKey, string> = {
    min_likes: "likes",
    min_replies: "replies",
    min_reposts: "reposts",
    min_quotes: "quotes",
    min_views: "views",
    min_participants: "entrants",
    min_verified: "verified",
  };
  const condParts = selKeys.map((k) => {
    const n = Math.floor(Number(vals[k])) || 100;
    return lang === "zh" ? `${n} ${COND_SHORT_ZH[k]}` : `${n} ${COND_SHORT_EN[k]}`;
  });
  const prizeLabel =
    amount && amount > 0
      ? crypto
        ? `${amount} ${f.currency}`
        : `$${amount} ${lang === "zh" ? "礼品卡" : "gift card"}`
      : "";
  const autoTitle = condParts.length
    ? lang === "zh"
      ? prizeLabel
        ? `达到 ${condParts.join(" + ")}，赢 ${prizeLabel}`
        : `达到 ${condParts.join(" + ")} 即抽奖`
      : prizeLabel
        ? `${condParts.join(" & ")} to win ${prizeLabel}`
        : `${condParts.join(" & ")} giveaway`
    : prizeLabel
      ? lang === "zh"
        ? `${prizeLabel} 抽奖`
        : `${prizeLabel} giveaway`
      : "";
  const titleText = titleTouched ? f.title : autoTitle;

  const origin = typeof window === "undefined" ? "https://fairdraw.win" : window.location.origin;
  const posted = !!f.tweet_url.trim();
  const campaignUrl = row
    ? `${origin.replace(/\/$/, "")}/c/${row.slug}`
    : `${origin.replace(/\/$/, "")}`;

  // Card/text model — everything downstream derives from this.
  const goals = useMemo<CardGoal[]>(
    () =>
      selKeys.map((k) => ({
        v: Math.max(1, Math.floor(Number(vals[k])) || 100),
        ...METRIC_GOAL[k],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selKeys.join(","), METRIC_KEYS.map((k) => vals[k]).join(",")],
  );
  const d = useMemo(
    () =>
      cardData({
        host: poster?.handle ?? "fairdraw",
        amt: amount ?? 0,
        win: winners,
        hrs: f.days === "1h" ? 1 : Number(f.days) * 24,
        crypto,
        currency: f.currency,
        goals,
        kw: f.keyword,
        url: campaignUrl,
      }),
    [poster, amount, winners, f.days, crypto, f.currency, goals, f.keyword, campaignUrl],
  );

  // Tweet texts: body regenerates on data/tone change unless the user edited it.
  const [tone, setTone] = useState(0);
  const [cardSize, setCardSize] = useState<CardSize>("wide");
  const [cardTheme, setCardTheme] = useState<CardTheme>("gold");
  const [body, setBody] = useState("");
  const [bodyTouched, setBodyTouched] = useState(false);
  const [reply, setReply] = useState("");
  const [alt, setAlt] = useState("");
  useEffect(() => {
    if (!bodyTouched) setBody(tweetBody(d, tone, f.requirement));
  }, [d, tone, f.requirement, bodyTouched]);
  useEffect(() => {
    setReply(replyText(d, tone));
    setAlt(altText(d, tone));
  }, [d, tone]);
  const bodyLen = tweetLen(body);

  // Live ticket amounts — same fee math as the real FundingPanel.
  const pool = amount ?? 0;
  const fee = feeAmount(fees, pool);
  const total = pool + fee;

  // Five hero steps: pool → conditions → content → tweet → payment.
  const pDone = [
    pool > 0,
    selKeys.length > 0,
    !!(titleText.trim() && prizeText.trim()),
    posted || body.trim().length > 0,
    funded,
  ];
  const nowIdx = pDone.findIndex((done) => !done);
  const pLabels = [t("f.psPool"), t("f.psCond"), t("f.psContent"), t("f.psTweet"), t("f.psPay")];

  // Show the organiser's own X identity in the preview and card.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const x = data.user?.identities?.find((i) => i.provider === "x" || i.provider === "twitter");
      const id = x?.identity_data as Record<string, unknown> | undefined;
      const md = data.user?.user_metadata as Record<string, unknown> | undefined;
      const un = id?.["user_name"] ?? id?.["preferred_username"] ?? id?.["screen_name"];
      const nm = id?.["name"] ?? md?.["full_name"];
      const av =
        id?.["avatar_url"] ?? id?.["picture"] ?? id?.["profile_image_url"] ?? md?.["avatar_url"];
      if (typeof un === "string" && un)
        setPoster({
          name: typeof nm === "string" && nm ? nm : un,
          handle: un,
          avatar: typeof av === "string" && av ? av : null,
        });
    });
  }, []);

  /** Insert the campaign row, or update it when a draft already exists. */
  async function ensureCreated(opts: { silent?: boolean } = {}): Promise<Created | null> {
    const title = titleText.trim();
    const prize = prizeText.trim();
    if (!title) {
      if (!opts.silent) toast.error(t("f.title"));
      return null;
    }
    if (!prize) {
      if (!opts.silent) toast.error(t("f.prize"));
      return null;
    }
    if (!amount || amount <= 0) {
      if (!opts.silent) toast.error(t("f.amount"));
      return null;
    }
    if (selKeys.length === 0) {
      if (!opts.silent) toast.error(t("f.pickMin"));
      return null;
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      if (!opts.silent) toast.error(t("c.signin"));
      return null;
    }
    const share_meta = {
      body,
      reply,
      alt,
      size: cardSize,
      theme: cardTheme,
      tone,
      tags: f.requirement,
    };
    const payload = {
      owner_id: u.user.id,
      title,
      prize,
      prize_amount: amount,
      currency: f.currency.trim() || "USDT",
      // Declared pools await real funding (Stripe checkout or on-chain transfer) before the draw.
      escrow_status: "awaiting",
      winners_count: winners,
      share_language: lang,
      share_duration: f.days === "1h" ? 1 : Number(f.days),
      // Temporary test option: "1h" ends the campaign one hour from now.
      ends_at:
        f.days === "1h"
          ? new Date(Date.now() + 3600e3).toISOString()
          : endsAtFromDays(Number(f.days)),
      requirement: f.requirement.trim(),
      tweet_url: f.tweet_url.trim() || null,
      conditions,
      share_meta,
    };
    const cols =
      "id, slug, title, prize, ends_at, prize_amount, currency, winners_count, share_language, share_duration, conditions, requirement, payment_method";
    // share_meta may not exist until migration 0015 runs — retry without it on schema errors.
    const { share_meta: _meta, ...rest } = payload;
    let { data, error } = row
      ? await supabase.from("campaigns").update(payload).eq("id", row.id).select(cols).single()
      : await supabase.from("campaigns").insert(payload).select(cols).single();
    if (error && /share_meta/i.test(error.message)) {
      ({ data, error } = row
        ? await supabase.from("campaigns").update(rest).eq("id", row.id).select(cols).single()
        : await supabase.from("campaigns").insert(rest).select(cols).single());
    }
    if (error) {
      if (!opts.silent)
        toast.error(error.message.includes("WEEKLY_LIMIT") ? t("f.limit") : error.message);
      return null;
    }
    setRow(data as Created);
    return data as Created;
  }

  // First complete state → create the draft so card QR/reply get the real /c/{slug}.
  const formReady = !!(
    amount &&
    amount > 0 &&
    selKeys.length > 0 &&
    titleText.trim() &&
    prizeText.trim()
  );
  useEffect(() => {
    if (!formReady || row) return;
    const id = setTimeout(() => {
      void ensureCreated({ silent: true });
    }, 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formReady, !!row]);

  /** Single CTA: save the campaign then start the chosen payment flow. */
  async function payNow() {
    if (!canPay) return;
    setBusy(true);
    try {
      const c = await ensureCreated();
      if (!c) return;
      setEditing(false);
      setConfirmed(true);
      const { error: pErr } = await supabase
        .from("campaigns")
        .update({ payment_method: effMethod })
        .eq("id", c.id);
      if (pErr) {
        toast.error(pErr.message);
        return;
      }
      if (effMethod === "stripe") {
        const r = await checkout({ data: { campaignId: c.id, origin: window.location.origin } });
        if (r.url) window.location.href = r.url;
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Chain payments create/sync the row lazily: called by ChainFundingBody before each on-chain action. */
  async function ensureChainCampaign(): Promise<FundingCampaign | null> {
    const c = await ensureCreated();
    if (!c) return null;
    setEditing(false);
    setConfirmed(true);
    const { error } = await supabase
      .from("campaigns")
      .update({ payment_method: "chain" })
      .eq("id", c.id);
    if (error) {
      toast.error(error.message);
      return null;
    }
    return { ...c, payment_method: "chain" };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    void payNow();
  }

  if (row && funded) return <AfterCreate c={row} />;

  return (
    <div className="page-new-bg">
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "48px 24px 80px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 36,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "40px",
                fontWeight: 700,
                letterSpacing: "-.01em",
                lineHeight: 1.2,
              }}
            >
              {t("new.title")}
            </h1>
            <p style={{ color: "var(--muted-foreground)", marginTop: "8px" }}>
              {lang === "zh"
                ? "设好奖池和开奖条件，奖金托管在平台，达标后自动公开抽奖。"
                : "Set prize pool and conditions — funds escrowed, drawn on-chain when targets are met."}
            </p>
          </div>
          <div className="p-steps">
            {pLabels.map((lb, i) => (
              <Fragment key={lb}>
                {i > 0 && <div className="p-bar" />}
                <div className={`p-step${pDone[i] ? " done" : i === nowIdx ? " now" : ""}`}>
                  <i>{pDone[i] ? "✓" : i + 1}</i>
                  {lb}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_420px]">
          <form
            id="new-campaign"
            onSubmit={submit}
            className="space-y-0 panel-glass"
            style={{ padding: "32px 36px" }}
          >
            <fieldset disabled={confirmed && !editing} className="contents">
              <StepSection n={1} ok={pDone[0]!} title={t("f.step1")} desc={t("f.step1D")} first>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label={t("f.currency")}>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={f.currency}
                      onChange={set("currency")}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {!chainOk && (
                      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                        {t("pay.nonUsdtHint")}
                      </p>
                    )}
                  </Field>
                  <Field label={t("f.ends")}>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={f.days}
                      onChange={set("days")}
                    >
                      <option value="1h">{t("f.hour1")}</option>
                      {DURATIONS.map((d) => (
                        <option key={d} value={d}>
                          {t(`f.day${d}` as "f.day1")}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label={t("f.amount")}>
                  <div className="amount-wrap">
                    <Input
                      required
                      type="number"
                      min={0.01}
                      step="0.01"
                      placeholder="20"
                      value={f.prize_amount}
                      onChange={set("prize_amount")}
                    />
                    <span className="amount-unit">{crypto ? f.currency : "USD"}</span>
                  </div>
                </Field>
                <div className="flex flex-wrap gap-2">
                  {PRESET_AMOUNTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setF({ ...f, prize_amount: String(a) })}
                      className={`chip-pill${Number(f.prize_amount) === a ? " on" : ""}`}
                    >
                      {a.toLocaleString("en-US")}
                    </button>
                  ))}
                </div>
                <Field label={t("f.winners")}>
                  <>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      required
                      list="winner-options"
                      value={f.winners_count}
                      onChange={set("winners_count")}
                    />
                    <datalist id="winner-options">
                      {[1, 2, 3, 5, 10, 20, 50, 100].map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                    {amount != null && amount > 0 && winners > 0 && (
                      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6 }}>
                        {t("f.perWinner")}{" "}
                        {crypto
                          ? `${(amount / winners).toFixed(2)} ${f.currency}`
                          : `$${(amount / winners).toFixed(2)}${lang === "zh" ? " 礼品卡" : " gift card"}`}
                      </p>
                    )}
                  </>
                </Field>
              </StepSection>

              <StepSection n={2} ok={pDone[1]!} title={t("f.step2")} desc={t("f.condHint")}>
                <Field label={t("f.keyword")}>
                  <Input maxLength={100} value={f.keyword} onChange={set("keyword")} />
                </Field>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{t("f.condTitle")}</p>
                  <span className="text-xs text-muted-foreground">
                    {t("f.condCount")} {selKeys.length} / {MAX_CONDITIONS}
                  </span>
                </div>
                <div
                  className="grid gap-2 sm:grid-cols-2"
                  role="group"
                  aria-label={t("f.condTitle")}
                >
                  {METRIC_KEYS.map((k) => {
                    const Icon = METRIC_ICON[k];
                    const locked = k === "min_replies";
                    return (
                      <div
                        key={k}
                        role="checkbox"
                        aria-checked={!!sel[k]}
                        tabIndex={locked ? -1 : 0}
                        className={`cond-card${sel[k] ? " active" : ""}`}
                        style={{ cursor: locked ? "default" : "pointer" }}
                        onClick={() => toggle(k)}
                        onKeyDown={(e) => {
                          if (!locked && (e.key === " " || e.key === "Enter")) {
                            e.preventDefault();
                            toggle(k);
                          }
                        }}
                      >
                        <span className="cond-ic">
                          <Icon style={{ width: 18, height: 18 }} />
                        </span>
                        <span style={{ flex: 1, fontWeight: 500, fontSize: "14px" }}>
                          {t(METRIC_LABEL[k])}
                          {locked && (
                            <span
                              style={{
                                display: "block",
                                fontSize: "11px",
                                fontWeight: 400,
                                color: "var(--muted-foreground)",
                              }}
                            >
                              · {t("f.required")}
                            </span>
                          )}
                        </span>
                        {sel[k] && (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            ≥
                            <Input
                              type="number"
                              min={1}
                              className="h-[34px] w-14 px-2 text-xs"
                              style={{ borderRadius: "9px" }}
                              value={vals[k]}
                              onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="cond-err" role="status">
                  {condErr}
                </div>
              </StepSection>

              <StepSection n={3} ok={pDone[2]!} title={t("f.step3")} desc={t("f.step3D")}>
                <Field label={t("f.prize")}>
                  <Input
                    required
                    maxLength={200}
                    placeholder={t("f.prizePh")}
                    value={prizeText}
                    onChange={(e) => {
                      setPrizeTouched(true);
                      setF({ ...f, prize: e.target.value });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{t("f.prizeAuto")}</p>
                </Field>
                <Field label={t("f.title")}>
                  <Input
                    required
                    maxLength={120}
                    value={titleText}
                    onChange={(e) => {
                      setTitleTouched(true);
                      setF({ ...f, title: e.target.value });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{t("f.titleAuto")}</p>
                </Field>
                <Field label={t("f.req")}>
                  <Input
                    maxLength={200}
                    placeholder={t("f.reqPh")}
                    value={f.requirement}
                    onChange={set("requirement")}
                  />
                  <p className="text-xs text-muted-foreground">{t("f.reqHint")}</p>
                </Field>
                <div>
                  <Field label={t("f.tweetUrl")}>
                    <Input
                      type="url"
                      placeholder="https://x.com/you/status/…"
                      value={f.tweet_url}
                      onChange={set("tweet_url")}
                    />
                  </Field>
                  <div className="inline-note">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    <p>{t("f.tweetHint")}</p>
                  </div>
                </div>
              </StepSection>

              <StepSection
                n={4}
                ok={pDone[3]!}
                title={t("f.step4")}
                desc={t("f.step4D")}
                badge={t("f.new")}
              >
                {posted && (
                  <div className="posted-note">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="m8 12 3 3 5-6" />
                    </svg>
                    <p>{t("f.postedNote")}</p>
                  </div>
                )}
                {!posted && (
                  <TweetComposer
                    t={t}
                    d={d}
                    poster={poster}
                    body={body}
                    setBody={(v) => {
                      setBodyTouched(true);
                      setBody(v);
                    }}
                    bodyLen={bodyLen}
                    reply={reply}
                    setReply={setReply}
                    alt={alt}
                    setAlt={setAlt}
                    tone={tone}
                    setTone={(i) => {
                      setTone(i);
                      setBodyTouched(false);
                    }}
                    cardSize={cardSize}
                    setCardSize={setCardSize}
                    cardTheme={cardTheme}
                    setCardTheme={setCardTheme}
                    getXStatus={getXStatus}
                    publishX={publishX}
                    campaignId={row?.id ?? null}
                    onPublished={(url) => setF((prev) => ({ ...prev, tweet_url: url }))}
                  />
                )}
              </StepSection>
            </fieldset>
          </form>

          <aside className="flex flex-col gap-5 lg:sticky lg:self-start" style={{ top: "88px" }}>
            <PreviewPanel
              t={t}
              d={d}
              poster={poster}
              body={body}
              reply={reply}
              cardSize={cardSize}
              cardTheme={cardTheme}
            />
            {confirmed && !editing && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {t("f.confirmed")}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs opacity-80 hover:underline hover:opacity-100"
                  onClick={() => setEditing(true)}
                >
                  {t("f.modify")}
                </button>
              </div>
            )}
            <PayTicket
              pool={pool}
              fee={fee}
              total={total}
              currency={crypto ? f.currency : "USD"}
              crypto={crypto}
              method={effMethod}
              setMethod={setPayMethod}
              stripeOk={stripeOk}
              chainOk={chainOk}
              canPay={canPay}
              busy={busy}
              setBusy={setBusy}
              onPay={payNow}
              getCampaign={ensureChainCampaign}
              onFunded={() => setFunded(true)}
              showStripeNote={showStripeNote}
              setShowStripeNote={setShowStripeNote}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Section 4 content: card options, body, publish row, reply + ALT. */
function TweetComposer({
  t,
  d,
  poster,
  body,
  setBody,
  bodyLen,
  reply,
  setReply,
  alt,
  setAlt,
  tone,
  setTone,
  cardSize,
  setCardSize,
  cardTheme,
  setCardTheme,
  getXStatus,
  publishX,
  campaignId,
  onPublished,
}: {
  t: (k: DictKey, p?: Record<string, string | number>) => string;
  d: CardData;
  poster: { name: string; handle: string; avatar: string | null } | null;
  body: string;
  setBody: (v: string) => void;
  bodyLen: number;
  reply: string;
  setReply: (v: string) => void;
  alt: string;
  setAlt: (v: string) => void;
  tone: number;
  setTone: (i: number) => void;
  cardSize: CardSize;
  setCardSize: (s: CardSize) => void;
  cardTheme: CardTheme;
  setCardTheme: (s: CardTheme) => void;
  getXStatus: () => Promise<{ configured: boolean }>;
  publishX: (o: {
    data: { campaignId: string; body: string; reply: string; alt: string; imagePngBase64: string };
  }) => Promise<unknown>;
  campaignId: string | null;
  onPublished: (tweetUrl: string) => void;
}) {
  const [modal, setModal] = useState<
    "closed" | "off" | "auth" | "confirm" | "run" | "done" | "error"
  >("closed");
  const [runStep, setRunStep] = useState(0);
  const [pubUrl, setPubUrl] = useState("");
  const [canShare, setCanShare] = useState(false);
  const cardRef = useRef<HTMLCanvasElement | null>(null);

  const pngBlob = () =>
    new Promise<Blob>((res, rej) => {
      const cv = cardRef.current;
      if (!cv) {
        rej(new Error("no card"));
        return;
      }
      cv.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png");
    });
  const intentUrl = () => `https://x.com/intent/post?text=${encodeURIComponent(body)}`;

  // Show the Web Share button only on devices that can share files.
  useEffect(() => {
    (async () => {
      try {
        const cv = document.createElement("canvas");
        await renderCampaignCard(cv, d, cardSize, cardTheme, { avatarUrl: poster?.avatar ?? null });
        const blob = await campaignCardBlob(cv);
        const file = new File([blob], "fairdraw.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) setCanShare(true);
      } catch {
        /* share button stays hidden */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyOpen() {
    const w = window.open("about:blank", "_blank"); // open synchronously so pop-up blockers allow it
    try {
      const b = await pngBlob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
      toast.success(t("pub.imgCopied"));
    } catch {
      toast.error(t("pub.noClipboard"));
    }
    const url = intentUrl();
    if (w) w.location.href = url;
    else window.location.href = url;
  }
  async function shareApp() {
    try {
      const b = await pngBlob();
      const file = new File([b], "fairdraw.png", { type: "image/png" });
      await navigator.share({ files: [file], text: body });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(t("pub.shareFail"));
    }
  }

  async function oneClick() {
    if (!body.trim()) {
      toast.error(t("pub.empty"));
      return;
    }
    const status = await getXStatus();
    if (!status.configured) {
      setModal("off");
      return;
    }
    // Direct access token: skip auth step, go straight to confirm.
    setModal("confirm");
  }
  async function runPublish() {
    if (!campaignId) {
      setModal("error");
      return;
    }
    setModal("run");
    setRunStep(0);
    const tick = (i: number) => {
      setRunStep(i);
      if (i < 3) setTimeout(() => tick(i + 1), 600);
    };
    tick(1);
    try {
      const b = await pngBlob();
      // Upload card to Supabase storage so server fn receives a small URL
      // instead of a large base64 payload (avoids CSRF body-size issues).
      const imgPath = `x-cards/${campaignId}/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("campaign-share")
        .upload(imgPath, b, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("campaign-share")
        .createSignedUrl(imgPath, 300);
      const imageUrl = signed?.signedUrl ?? "";
      const out = (await publishX({ data: { campaignId, body, reply, alt, imageUrl } })) as {
        tweetUrl?: string;
      };
      setRunStep(4);
      const url = out?.tweetUrl ?? "";
      setPubUrl(url);
      if (url) onPublished(url);
      setModal("done");
    } catch {
      setModal("error");
    }
  }

  const runLabels = [t("xpub.s1"), t("xpub.s2"), t("xpub.s3"), t("xpub.s4")];
  return (
    <>
      <div className="opt-row">
        <div>
          <div className="text-xs font-medium text-muted-foreground" style={{ marginBottom: 8 }}>
            {t("f.size")}
          </div>
          <div className="seg">
            {(["wide", "square"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={cardSize === s}
                onClick={() => setCardSize(s)}
              >
                {t(s === "wide" ? "f.sizeWide" : "f.sizeSquare")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground" style={{ marginBottom: 8 }}>
            {t("f.theme")}
          </div>
          <div
            className="seg"
            style={{ gap: 8, border: "none", background: "transparent", padding: 0 }}
          >
            {(["gold", "neon", "light"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className="th-b"
                aria-pressed={cardTheme === s}
                aria-label={t(`f.theme${s[0]!.toUpperCase()}${s.slice(1)}` as "f.themeGold")}
                style={{ background: THEME_SWATCH[s] }}
                onClick={() => setCardTheme(s)}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground" style={{ marginBottom: 8 }}>
            {t("f.tone")}
          </div>
          <div className="seg">
            {TONES.map((k, i) => (
              <button key={k} type="button" aria-pressed={tone === i} onClick={() => setTone(i)}>
                {t(k)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Field
        label={
          <span>
            {t("f.body")}{" "}
            <span style={{ fontWeight: 400 }} className="text-muted-foreground">
              · {t("f.bodyHint")}
            </span>
          </span>
        }
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ minHeight: 170 }}
        />
        <div className="tx-f">
          <span className={bodyLen > 280 ? "over" : ""}>{t("f.len", { n: bodyLen })}</span>
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              void navigator.clipboard.writeText(body).then(() => toast.success(t("c.copied")));
            }}
          >
            <Copy />
            {t("f.copyBody")}
          </button>
        </div>
      </Field>

      <div className="pub-box">
        <div className="pub-h">
          <b>{t("pub.title")}</b>
          <span>{t("pub.sub")}</span>
        </div>
        <div className="pub-row">
          <button type="button" className="xb white" onClick={() => void oneClick()}>
            {X_LOGO}
            {t("pub.one")}
          </button>
          <button type="button" className="xb line" onClick={() => void copyOpen()}>
            <Copy />
            {t("pub.copyOpen")}
          </button>
          {canShare && (
            <button type="button" className="xb line" onClick={() => void shareApp()}>
              <Send />
              {t("pub.shareApp")}
            </button>
          )}
        </div>
        <p className="pub-tip">
          <b>{t("pub.one")}</b>：{t("pub.tip1")}
          <br />
          <b>{t("pub.copyOpen")}</b>：{t("pub.tip2")}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2" style={{ marginTop: 18 }}>
        <Field label={t("f.reply")}>
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            style={{ minHeight: 72 }}
          />
          <div className="tx-f">
            <span />
            <button
              type="button"
              className="mini-btn"
              onClick={() => {
                void navigator.clipboard.writeText(reply).then(() => toast.success(t("c.copied")));
              }}
            >
              {t("f.copy")}
            </button>
          </div>
        </Field>
        <Field label={t("f.alt")}>
          <Textarea
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            style={{ minHeight: 72 }}
          />
          <div className="tx-f">
            <span />
            <button
              type="button"
              className="mini-btn"
              onClick={() => {
                void navigator.clipboard.writeText(alt).then(() => toast.success(t("c.copied")));
              }}
            >
              {t("f.copy")}
            </button>
          </div>
        </Field>
      </div>

      {/* Hidden render canvas — the blob source for copy/share/publish. */}
      <HiddenCard
        ref={cardRef}
        d={d}
        size={cardSize}
        theme={cardTheme}
        avatarUrl={poster?.avatar ?? null}
      />

      {modal !== "closed" && (
        <div
          className="xmodal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal("closed");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setModal("closed");
          }}
          tabIndex={-1}
        >
          <div className="xmbox">
            <div className="xmh">
              <span className="xic">{X_LOGO}</span>
              <b>
                {modal === "off"
                  ? t("xpub.offTitle")
                  : modal === "auth"
                    ? t("xpub.authTitle")
                    : modal === "confirm"
                      ? t("xpub.confirmTitle")
                      : modal === "run"
                        ? t("xpub.running")
                        : modal === "done"
                          ? t("xpub.doneTitle")
                          : t("xpub.offTitle")}
              </b>
              <button type="button" aria-label={t("xpub.close")} onClick={() => setModal("closed")}>
                ✕
              </button>
            </div>
            <div className="xmb">
              {modal === "off" && (
                <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>{t("pub.off")}</p>
              )}
              {modal === "auth" && (
                <>
                  <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
                    {t("xpub.authDesc", { handle: d.host })}
                  </p>
                  <ul className="xperm">
                    <li>
                      <i>✓</i>
                      {t("xpub.p1")}
                    </li>
                    <li>
                      <i>✓</i>
                      {t("xpub.p2")}
                    </li>
                    <li>
                      <i>✓</i>
                      {t("xpub.p3")}
                    </li>
                    <li className="no">
                      <i>✕</i>
                      {t("xpub.n1")}
                    </li>
                    <li className="no">
                      <i>✕</i>
                      {t("xpub.n2")}
                    </li>
                  </ul>
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 12 }}>
                    {t("xpub.revoke")}
                  </p>
                </>
              )}
              {modal === "confirm" && (
                <>
                  <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
                    {t("xpub.willPost", { handle: d.host })}
                  </p>
                  <div className="xmprev">
                    <div className="pt">{body}</div>
                    <CardThumb
                      d={d}
                      size={cardSize}
                      theme={cardTheme}
                      avatarUrl={poster?.avatar ?? null}
                      alt={alt}
                    />
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 12 }}>
                    {t("xpub.thenReply", { reply })}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                    {t("xpub.altNote")}
                  </p>
                </>
              )}
              {modal === "run" && (
                <ul className="xprog">
                  {runLabels.map((lb, i) => (
                    <li key={lb} className={runStep > i ? "ok" : runStep === i + 1 ? "run" : ""}>
                      <i>{runStep > i ? "✓" : i + 1}</i>
                      {lb}
                    </li>
                  ))}
                </ul>
              )}
              {modal === "done" && (
                <>
                  <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
                    {t("xpub.doneDesc")}
                  </p>
                  {pubUrl && (
                    <div className="xdone">
                      <code>{pubUrl.replace("https://", "")}</code>
                      <a
                        className="mini-btn"
                        href={pubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: "none" }}
                      >
                        {t("xpub.view")}
                      </a>
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 12 }}>
                    {t("xpub.paidNote")}
                  </p>
                </>
              )}
              {modal === "error" && (
                <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>{t("pub.off")}</p>
              )}
            </div>
            <div className="xmf">
              {modal === "off" && (
                <button type="button" className="xb main" onClick={() => setModal("closed")}>
                  {t("xpub.close")}
                </button>
              )}
              {modal === "auth" && (
                <>
                  <button type="button" className="xb line" onClick={() => setModal("closed")}>
                    {t("xpub.cancel")}
                  </button>
                  <button type="button" className="xb white" onClick={() => setModal("confirm")}>
                    {X_LOGO}
                    {t("xpub.goAuth")}
                  </button>
                </>
              )}
              {modal === "confirm" && (
                <>
                  <button type="button" className="xb line" onClick={() => setModal("closed")}>
                    {t("xpub.back")}
                  </button>
                  <button type="button" className="xb main" onClick={() => void runPublish()}>
                    {X_LOGO}
                    {t("xpub.go")}
                  </button>
                </>
              )}
              {modal === "done" && (
                <button type="button" className="xb main" onClick={() => setModal("closed")}>
                  {t("xpub.goPay")}
                </button>
              )}
              {modal === "error" && (
                <>
                  <button type="button" className="xb line" onClick={() => setModal("closed")}>
                    {t("xpub.cancel")}
                  </button>
                  <button type="button" className="xb main" onClick={() => void runPublish()}>
                    {t("xpub.go")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Off-screen canvas that stays in sync for blob exports inside the composer. */
const HiddenCard = forwardRef<
  HTMLCanvasElement,
  { d: CardData; size: CardSize; theme: CardTheme; avatarUrl: string | null }
>(function HiddenCard({ d, size, theme, avatarUrl }, ref) {
  const inner = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = inner.current;
    if (!cv) return;
    void renderCampaignCard(cv, d, size, theme, { avatarUrl }).catch(() => {});
    if (ref && typeof ref !== "function") ref.current = cv;
  }, [d, size, theme, avatarUrl, ref]);
  const dims = CARD_SIZES[size];
  return (
    <canvas
      ref={inner}
      width={dims.w}
      height={dims.h}
      style={{ display: "none" }}
      aria-hidden="true"
    />
  );
});

/** Small thumbnail of the card for the confirm modal. */
function CardThumb({
  d,
  size,
  theme,
  avatarUrl,
  alt,
}: {
  d: CardData;
  size: CardSize;
  theme: CardTheme;
  avatarUrl: string | null;
  alt: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [src, setSrc] = useState("");
  useEffect(() => {
    const cv = ref.current ?? document.createElement("canvas");
    void renderCampaignCard(cv, d, size, theme, { avatarUrl })
      .then(() => setSrc(cv.toDataURL("image/png")))
      .catch(() => {});
  }, [d, size, theme, avatarUrl]);
  return src ? <img src={src} alt={alt} /> : <canvas ref={ref} style={{ display: "none" }} />;
}

/** Right rail: X-realistic preview (main tweet + card image + first reply) + copy/download. */
function PreviewPanel({
  t,
  d,
  poster,
  body,
  reply,
  cardSize,
  cardTheme,
}: {
  t: (k: DictKey, p?: Record<string, string | number>) => string;
  d: CardData;
  poster: { name: string; handle: string; avatar: string | null } | null;
  body: string;
  reply: string;
  cardSize: CardSize;
  cardTheme: CardTheme;
}) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const [imgErr, setImgErr] = useState(false);
  const dims = CARD_SIZES[cardSize];
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    void renderCampaignCard(cv, d, cardSize, cardTheme, {
      avatarUrl: poster?.avatar ?? null,
    }).catch(() => {});
  }, [d, cardSize, cardTheme, poster]);
  // Re-render once webfonts land so canvas text isn't drawn with fallbacks.
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !document.fonts) return;
    let live = true;
    document.fonts.ready.then(() => {
      if (live && cvRef.current)
        void renderCampaignCard(cvRef.current, d, cardSize, cardTheme, {
          avatarUrl: poster?.avatar ?? null,
        }).catch(() => {});
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = poster?.name ?? "FairDraw";
  const handle = poster?.handle ?? "fairdraw";
  const initial = name.trim().slice(0, 2).toUpperCase() || "FD";
  async function copyImg() {
    const cv = cvRef.current;
    if (!cv) return;
    cv.toBlob(async (b) => {
      if (!b) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
        toast.success(t("pub.imgCopied2"));
      } catch {
        toast.error(t("pub.noClipboard"));
      }
    }, "image/png");
  }
  function dl() {
    const cv = cvRef.current;
    if (!cv) return;
    cv.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `fairdraw-card-${cardSize}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(t("pub.dl"));
    }, "image/png");
  }
  const replyHtml = reply
    .replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)
    .replace(/https?:\/\/\S+/, (u) => `<a href="#">${u.replace(/^https?:\/\/(www\.)?/, "")}</a>`);
  return (
    <div className="panel-glass" style={{ paddingBottom: 4 }}>
      <div className="card-h">
        <h3>{t("new.preview")}</h3>
        <span className="live-dot">{t("new.previewNow")}</span>
      </div>
      <div className="tweet-card main">
        <span className="tweet-av">
          {poster?.avatar && !imgErr ? (
            <img src={poster.avatar} alt={name} onError={() => setImgErr(true)} />
          ) : (
            initial
          )}
        </span>
        <div className="tweet-b">
          <div className="tweet-n">
            <b>{name}</b>
            <span>
              @{handle.replace(/^@/, "")} · {t("new.now")}
            </span>
          </div>
          <div className="tweet-t">{body}</div>
          <div className="tweet-img">
            <canvas ref={cvRef} width={dims.w} height={dims.h} />
            <span className="alt-tag">ALT</span>
          </div>
          <div className="tweet-act">
            <span>
              <MessageCircle />0
            </span>
            <span>
              <Repeat2 />0
            </span>
            <span>
              <Heart />0
            </span>
            <span>
              <BarChart3 />0
            </span>
            <span style={{ gap: 10 }}>
              <Bookmark />
              <Share />
            </span>
          </div>
        </div>
      </div>
      <div className="tweet-card reply">
        <span className="tweet-av">
          {poster?.avatar && !imgErr ? <img src={poster.avatar} alt={name} /> : initial}
        </span>
        <div className="tweet-b">
          <div className="tweet-n">
            <b>{name}</b>
            <span>
              @{handle.replace(/^@/, "")} · {t("new.replyTag")}
            </span>
          </div>
          <div className="tweet-t" dangerouslySetInnerHTML={{ __html: replyHtml }} />
        </div>
      </div>
      <div className="pv-f">
        <button type="button" className="mini-btn" onClick={() => void copyImg()}>
          <Copy />
          {t("new.copyImg")}
        </button>
        <button type="button" className="mini-btn" onClick={dl}>
          <ImageDown />
          {t("new.dlPng")}
        </button>
      </div>
    </div>
  );
}

/** Always-visible payment ticket: live pool+fee total, method tabs, single pay CTA that saves the campaign then starts checkout. */
function PayTicket({
  pool,
  fee,
  total,
  currency,
  crypto,
  method,
  setMethod,
  stripeOk,
  chainOk,
  canPay,
  busy,
  setBusy,
  onPay,
  getCampaign,
  onFunded,
  showStripeNote,
  setShowStripeNote,
}: {
  pool: number;
  fee: number;
  total: number;
  currency: string;
  crypto: boolean;
  method: "stripe" | "chain";
  setMethod: (m: "stripe" | "chain") => void;
  stripeOk: boolean;
  chainOk: boolean;
  canPay: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onPay: () => void;
  getCampaign: () => Promise<FundingCampaign | null>;
  onFunded: () => void;
  showStripeNote: boolean;
  setShowStripeNote: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const chainName = chainConfig().chainName;
  const cur = crypto ? currency : "USD";
  return (
    <div className="ticket-wrap">
      <div className="ticket-inner">
        <div className="t-top">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{t("m.funding")}</h3>
            {method === "chain" && crypto && <span className="chain-badge">{chainName}</span>}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 18 }}>
            {t("m.fundDue")}
          </p>
          <div className="t-amt">
            <span className="t-amt-big">{total.toFixed(2)}</span>
            <span className="t-amt-cur">{cur}</span>
          </div>
          <div className="t-break">
            <span>
              {t("m.fundPool")} <b>{pool.toFixed(2)}</b>
            </span>
            <span>
              {t("m.fundFee")} <b>{fee.toFixed(2)}</b> {cur}
            </span>
          </div>
        </div>
        <div className="perf-notch" aria-hidden="true" />
        <div className="t-bot">
          <div className="seg-tabs" role="tablist">
            <span style={{ display: "inline-block", flex: 1 }}>
              <button
                type="button"
                role="tab"
                aria-selected={method === "stripe"}
                style={{ width: "100%" }}
                disabled={!stripeOk}
                onClick={() => {
                  if (stripeOk) {
                    setMethod("stripe");
                    setShowStripeNote(false);
                  } else setShowStripeNote(!showStripeNote);
                }}
              >
                {t("pay.stripeTab")}
              </button>
            </span>
            <button
              type="button"
              role="tab"
              aria-selected={method === "chain"}
              disabled={!chainOk}
              onClick={() => chainOk && setMethod("chain")}
            >
              {t("pay.chainTab")}
            </button>
          </div>
          {showStripeNote && !stripeOk && (
            <p
              style={{
                fontSize: 12,
                color: "var(--muted-foreground)",
                marginTop: 10,
                textAlign: "center",
                padding: "6px 10px",
                background: "rgba(255,255,255,.04)",
                borderRadius: 8,
              }}
            >
              {t("pay.stripeDisabled")}
            </p>
          )}
          {method === "stripe" && (
            <>
              <button
                type="button"
                className="btn-gradient"
                style={{ marginTop: 14 }}
                disabled={busy || !canPay}
                onClick={onPay}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {t("m.fundStripeBtn")} {total.toFixed(2)} {cur}
              </button>
              <div className="wallets-list">
                <span>VISA</span>
                <span>Mastercard</span>
                <span>Apple Pay</span>
                <span>Google Pay</span>
                <span>支付宝</span>
              </div>
              <div className="inline-note" style={{ marginTop: 12 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <p style={{ fontSize: 12 }}>{t("pay.giftNote")}</p>
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  textAlign: "center",
                  marginTop: 10,
                }}
              >
                {t("m.fundStripeNote")}
              </p>
            </>
          )}
          {method === "chain" && (
            <ChainFundingBody
              getCampaign={getCampaign}
              total={total}
              busy={busy}
              setBusy={setBusy}
              onDone={onFunded}
            />
          )}
        </div>
        <div className="trust-line">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          {t("m.fundTrust")}
        </div>
      </div>
    </div>
  );
}

/** After the pool is funded: jump to X with the generated tweet pre-filled. */
function AfterCreate({ c }: { c: Created }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [origin, setOrigin] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    let active = true;
    let localUrl: string | undefined;
    setImageError(false);
    async function generate() {
      try {
        const blob = await renderShareImage(c);
        localUrl = URL.createObjectURL(blob);
        if (active) setImage(localUrl);
        const path = `${c.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("campaign-share")
          .upload(path, blob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error(uploadError.message);
        const { error: updateError } = await supabase
          .from("campaigns")
          .update({ share_image_path: path })
          .eq("id", c.id);
        if (updateError) throw new Error(updateError.message);
      } catch {
        if (active) setImageError(true);
      }
    }
    void generate();
    return () => {
      active = false;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [c, attempt]);
  const text = campaignTweet(c, origin);
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-4xl font-semibold">{t("new.created")}</h1>
      <p className="mt-3 text-muted-foreground">{t("new.createdSub")}</p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">
          {t("new.stepTweet")} · {t("new.tweetPreview")}
        </p>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted p-4 font-mono text-sm">
          {text}
        </pre>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <a href={intent} target="_blank" rel="noopener noreferrer">
              {t("new.postToX")} ↗
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(text);
              toast.success(t("c.copied"));
            }}
          >
            {t("new.copyText")}
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("new.afterPost")}</p>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="font-semibold">{t("share.image")}</h2>
        {image && (
          <img
            src={image}
            alt={c.title}
            width={1200}
            height={630}
            className="aspect-[1200/630] w-full rounded-lg border border-border object-contain"
          />
        )}
        {image && (
          <Button asChild variant="outline">
            <a href={image} download={`fairdraw-${c.slug}.jpg`}>
              <Download className="size-4" />
              {t("share.download")}
            </a>
          </Button>
        )}
        {imageError && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{t("share.imageError")}</p>
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              {t("share.retry")}
            </Button>
          </div>
        )}
        {!image && !imageError && <p className="text-muted-foreground">{t("common.loading")}</p>}
      </section>

      <Button
        className="mt-6 w-full"
        variant="secondary"
        onClick={() => navigate({ to: "/manage/$id", params: { id: c.id } })}
      >
        {t("new.goManage")}
      </Button>
      <p className="mt-4 text-center text-sm">
        <Link to="/dashboard" className="text-primary hover:underline">
          {t("nav.dashboard")}
        </Link>
      </p>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StepSection({
  n,
  ok,
  title,
  desc,
  children,
  first = false,
  badge,
}: {
  n: number;
  ok: boolean;
  title: string;
  desc?: string;
  children: React.ReactNode;
  first?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`space-y-4 py-8 ${first ? "" : "border-t border-[rgba(255,255,255,.07)]"}${ok ? " sec-ok" : ""}`}
    >
      <div className="sec-h">
        <span className="sec-n">{ok ? "✓" : n}</span>
        <h2 style={{ fontSize: "18px", fontWeight: 700 }}>{title}</h2>
        {badge && <span className="sec-badge">{badge}</span>}
      </div>
      {desc && <p className="sec-d">{desc}</p>}
      {children}
    </div>
  );
}
