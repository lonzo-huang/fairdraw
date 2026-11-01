import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { type Conditions } from "@/lib/conditions";
import { campaignTweet, prizeSummary, type ShareCampaign } from "@/lib/campaign-share";
import { renderShareImage } from "@/lib/campaign-share-image";
import { BarChart3, Bookmark, Download, Heart, MessageCircle, Repeat2, Share } from "lucide-react";
import { feeAmount, feeRate } from "@/lib/fees";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
import { CURRENCIES, DURATIONS, endsAtFromDays } from "@/lib/plans";
import { stripeSupports, type PaymentMethod } from "@/lib/payments";
import { FundingPanel } from "@/components/funding-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({ meta: [
    { title: "New campaign — FairDraw" },
    { name: "description", content: "Create a verifiable FairDraw community giveaway." },
    { property: "og:title", content: "New campaign — FairDraw" },
    { property: "og:description", content: "Create a verifiable FairDraw community giveaway." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: NewCampaign,
});

type Created = ShareCampaign & { id: string; ends_at: string; payment_method: string };

/** Selectable metric conditions: checkbox + ≥ threshold input, max 3 picked. */
const METRIC_KEYS = ["min_likes", "min_replies", "min_reposts", "min_quotes", "min_views", "min_participants", "min_verified"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
const METRIC_LABEL: Record<MetricKey, "cond.likes" | "cond.replies" | "cond.reposts" | "cond.quotes" | "cond.views" | "cond.participants" | "cond.verified"> = {
  min_likes: "cond.likes", min_replies: "cond.replies", min_reposts: "cond.reposts",
  min_quotes: "cond.quotes", min_views: "cond.views",
  min_participants: "cond.participants", min_verified: "cond.verified",
};
const MAX_CONDITIONS = 4;

function NewCampaign() {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [funded, setFunded] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [prizeTouched, setPrizeTouched] = useState(false);
  const [poster, setPoster] = useState<{ name: string; handle: string; avatar: string | null } | null>(null);
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
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const amount = f.prize_amount ? Number(f.prize_amount) : null;
  const winners = Math.max(1, Number(f.winners_count) || 1);
  const selKeys = METRIC_KEYS.filter((k) => sel[k]);

  function toggle(k: MetricKey) {
    if (k === "min_replies") return; // replies are the raffle entries — always required
    if (!sel[k] && selKeys.length >= MAX_CONDITIONS) { toast.error(t("f.pickMax")); return; }
    setSel({ ...sel, [k]: !sel[k] });
  }

  const conditions: Conditions = {};
  if (f.keyword.trim()) conditions.keyword = f.keyword.trim();
  for (const k of selKeys) {
    const n = Math.floor(Number(vals[k]));
    if (n > 0) conditions[k] = n;
  }

  const shareBase: ShareCampaign = {
    title: "", slug: "preview", prize: "",
    prize_amount: amount, currency: f.currency, winners_count: winners,
    share_language: lang, share_duration: Number(f.days), conditions, requirement: f.requirement,
  };

  // Prize description and title auto-generate until the user edits them by hand.
  const autoPrize = amount && amount > 0 ? prizeSummary({ ...shareBase, prize: f.prize }) : "";
  const prizeText = prizeTouched ? f.prize : autoPrize;

  const condNames = selKeys.map((k) => t(METRIC_LABEL[k]));
  const prizeTail = amount && amount > 0
    ? (lang === "zh" ? `赢 ${amount} ${f.currency}` : `to win ${amount} ${f.currency}`)
    : (lang === "zh" ? "抽奖" : "giveaway");
  const autoTitle = condNames.length
    ? `${condNames.join(" + ")} ${prizeTail}`
    : amount && amount > 0
      ? (lang === "zh" ? `${amount} ${f.currency} 抽奖` : `${amount} ${f.currency} giveaway`)
      : "";
  const titleText = titleTouched ? f.title : autoTitle;

  // Live preview of the share tweet the app generates after publishing.
  const origin = typeof window === "undefined" ? "https://fairdraw.win" : window.location.origin;
  const previewText = campaignTweet({ ...shareBase, title: titleText || t("f.title"), prize: prizeText }, origin);

  // Show the organiser's own X identity in the preview when they signed in with X.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const x = data.user?.identities?.find((i) => i.provider === "x" || i.provider === "twitter");
      const un = x?.identity_data?.user_name ?? x?.identity_data?.preferred_username ?? x?.identity_data?.screen_name;
      const nm = x?.identity_data?.name ?? data.user?.user_metadata?.full_name;
      const av = x?.identity_data?.avatar_url ?? x?.identity_data?.picture ?? x?.identity_data?.profile_image_url ?? data.user?.user_metadata?.avatar_url;
      if (typeof un === "string" && un)
        setPoster({ name: typeof nm === "string" && nm ? nm : un, handle: un, avatar: typeof av === "string" && av ? av : null });
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (created) return;
    const title = titleText.trim();
    const prize = prizeText.trim();
    if (!title) { toast.error(t("f.title")); return; }
    if (!prize) { toast.error(t("f.prize")); return; }
    if (!amount || amount <= 0) { toast.error(t("f.amount")); return; }
    if (selKeys.length === 0) { toast.error(t("f.pickMin")); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); toast.error(t("c.signin")); return; }
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        owner_id: u.user.id,
        title,
        prize,
        prize_amount: amount,
        currency: f.currency.trim() || "USDT",
        // Declared pools await real funding (Stripe checkout or on-chain transfer) before the draw.
        escrow_status: "awaiting",
        winners_count: winners,
        share_language: lang,
        share_duration: Number(f.days),
        ends_at: endsAtFromDays(Number(f.days)),
        requirement: f.requirement.trim(),
        tweet_url: f.tweet_url.trim() || null,
        conditions,
      })
      .select("id, slug, title, prize, ends_at, prize_amount, currency, winners_count, share_language, share_duration, conditions, requirement, payment_method")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("WEEKLY_LIMIT") ? t("f.limit") : error.message);
      return;
    }
    setCreated(data);
  }

  if (created && funded) return <AfterCreate c={created} />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-4xl font-semibold">{t("new.title")}</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form id="new-campaign" onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-6">
      <fieldset disabled={!!created} className="contents">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("f.amount")}><Input required type="number" min={0.01} step="0.01" placeholder="20" value={f.prize_amount} onChange={set("prize_amount")} /></Field>
          <Field label={t("f.currency")}><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={f.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("f.winners")}><><Input type="number" min={1} max={100} required list="winner-options" value={f.winners_count} onChange={set("winners_count")} /><datalist id="winner-options">{[1, 2, 3, 5, 10, 20, 50, 100].map((n) => <option key={n} value={n} />)}</datalist></></Field>
          <Field label={t("f.ends")}><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={f.days} onChange={set("days")}>{DURATIONS.map((d) => <option key={d} value={d}>{t(`f.day${d}` as "f.day1")}</option>)}</select></Field>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="font-medium">{t("f.condTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("f.condHint")}</p>
          <div className="mt-3 space-y-3">
            <Field label={t("f.keyword")}><Input maxLength={100} value={f.keyword} onChange={set("keyword")} /></Field>
            <div className="grid gap-2 sm:grid-cols-2">
              {METRIC_KEYS.map((k) => (
                <label key={k} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${sel[k] ? "border-primary bg-primary/5" : "border-border"} ${k === "min_replies" ? "cursor-not-allowed" : "cursor-pointer"}`}>
                  <input type="checkbox" checked={!!sel[k]} disabled={k === "min_replies"} onChange={() => toggle(k)} className="accent-[#d4a017]" />
                  <span>{t(METRIC_LABEL[k])}{k === "min_replies" ? ` · ${t("f.required")}` : ""}</span>
                  {sel[k] && (
                    <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                      ≥
                      <Input type="number" min={1} className="h-7 w-20 px-2" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        <Field label={t("f.prize")}>
          <Input required maxLength={200} placeholder={t("f.prizePh")} value={prizeText} onChange={(e) => { setPrizeTouched(true); setF({ ...f, prize: e.target.value }); }} />
          <p className="text-xs text-muted-foreground">{t("f.prizeAuto")}</p>
        </Field>
        <Field label={t("f.title")}>
          <Input required maxLength={120} value={titleText} onChange={(e) => { setTitleTouched(true); setF({ ...f, title: e.target.value }); }} />
          <p className="text-xs text-muted-foreground">{t("f.titleAuto")}</p>
        </Field>
        <Field label={t("f.req")}><Textarea rows={3} maxLength={1000} placeholder={t("f.reqPh")} value={f.requirement} onChange={set("requirement")} /></Field>

        <div className="rounded-xl border border-border p-4">
          <p className="font-medium">{t("f.tweetTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("f.tweetHint")}</p>
          <div className="mt-3">
            <Field label={t("f.tweetUrl")}><Input type="url" placeholder="https://x.com/you/status/…" value={f.tweet_url} onChange={set("tweet_url")} /></Field>
          </div>
        </div>
      </fieldset>
      </form>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-medium">{t("new.preview")}</p>
          <div className="mt-3">
            <TweetPreview
              name={poster?.name ?? "FairDraw"}
              handle={poster?.handle ?? "fairdraw"}
              avatar={poster?.avatar ?? null}
              now={t("new.previewNow")}
              text={previewText}
            />
          </div>
        </div>
        <Button type="submit" form="new-campaign" className="w-full" disabled={busy || !!created}>
          {created ? t("f.confirmed") : t("f.confirm")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("f.confirmHint")}</p>
        {created && <PrepayPanel c={created} onDone={() => setFunded(true)} />}
      </aside>
      </div>
    </div>
  );
}

/** X-style post card mirroring the generated share tweet. */
function TweetPreview({ name, handle, avatar, now, text }: { name: string; handle: string; avatar: string | null; now: string; text: string }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4 text-[15px] leading-5 text-[#e7e9ea]">
      <div className="flex gap-3">
        {avatar && !imgErr ? (
          <img src={avatar} alt={name} className="size-10 shrink-0 rounded-full object-cover" onError={() => setImgErr(true)} />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">
            {name.trim().slice(0, 1).toUpperCase() || "F"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate font-bold">{name}</span>
            <span className="truncate text-[#71767b]">@{handle.replace(/^@/, "")} · {now}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words">{text}</p>
          <div className="mt-3 flex items-center justify-between text-[#71767b]">
            <span className="flex items-center gap-1 text-xs"><MessageCircle className="size-4" />0</span>
            <span className="flex items-center gap-1 text-xs"><Repeat2 className="size-4" />0</span>
            <span className="flex items-center gap-1 text-xs"><Heart className="size-4" />0</span>
            <span className="flex items-center gap-1 text-xs"><BarChart3 className="size-4" />0</span>
            <span className="flex items-center gap-2"><Bookmark className="size-4" /><Share className="size-4" /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pool prepayment section: pick Stripe or an on-chain wallet, pay pool + fee, then publishing unlocks. */
function PrepayPanel({ c, onDone }: { c: Created; onDone: () => void }) {
  const { t } = useI18n();
  const { data: fees = [] } = useFeeTiers();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const currency = c.currency ?? "USDT";
  const total = (c.prize_amount ?? 0) + feeAmount(fees, c.prize_amount ?? 0);

  async function choose(m: PaymentMethod) {
    setBusy(true);
    const { error } = await supabase.from("campaigns").update({ payment_method: m }).eq("id", c.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setMethod(m);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="font-medium">💰 {t("f.prepay")}</p>
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{t("pay.poolBase")}</dt>
            <dd className="font-mono">{(c.prize_amount ?? 0).toFixed(2)} {currency}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{t("pay.feeLine")}（{c.prize_amount ? `${feeRate(fees, c.prize_amount)}%` : "—"}）</dt>
            <dd className="font-mono">{feeAmount(fees, c.prize_amount ?? 0).toFixed(2)} {currency}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-1.5">
            <dt className="font-medium">{t("pay.total")}</dt>
            <dd className="font-mono font-semibold">{total.toFixed(2)} {currency}{currency === "USDT" ? " / USD" : ""}</dd>
          </div>
        </dl>
        <div className="rounded-md bg-background/60 p-3 text-sm">
          <p className="font-medium">🛡️ {t("pay.escrowTitle")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>{t("pay.escrowCancel")}</li>
            <li>{t("pay.escrowRefund")}</li>
          </ul>
        </div>
        {!method && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">💳 {t("pay.methodTitle")}</p>
            <Button size="sm" disabled={busy || !stripeSupports(currency)} onClick={() => choose("stripe")}>{t("pay.stripe")}</Button>
            <Button size="sm" variant="secondary" disabled={busy || currency !== "USDT"} onClick={() => choose("chain")}>{t("pay.chain")}</Button>
            <p className="text-xs text-muted-foreground">{t("f.prepayHint")}</p>
          </div>
        )}
      </div>
      {method && <FundingPanel c={{ ...c, payment_method: method }} busy={busy} setBusy={setBusy} onDone={onDone} />}
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
  useEffect(() => { setOrigin(window.location.origin); }, []);
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
        const { error: uploadError } = await supabase.storage.from("campaign-share").upload(path, blob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error(uploadError.message);
        const { error: updateError } = await supabase.from("campaigns").update({ share_image_path: path }).eq("id", c.id);
        if (updateError) throw new Error(updateError.message);
      } catch { if (active) setImageError(true); }
    }
    void generate();
    return () => { active = false; if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [c, attempt]);
  const text = campaignTweet(c, origin);
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-4xl font-semibold">{t("new.created")}</h1>
      <p className="mt-3 text-muted-foreground">{t("new.createdSub")}</p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">{t("new.stepTweet")} · {t("new.tweetPreview")}</p>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted p-4 font-mono text-sm">{text}</pre>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <a href={intent} target="_blank" rel="noopener noreferrer">{t("new.postToX")} ↗</a>
          </Button>
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(text); toast.success(t("c.copied")); }}>
            {t("new.copyText")}
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("new.afterPost")}</p>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="font-semibold">{t("share.image")}</h2>
        {image && <img src={image} alt={c.title} width={1200} height={630} className="aspect-[1200/630] w-full rounded-lg border border-border object-contain" />}
        {image && <Button asChild variant="outline"><a href={image} download={`fairdraw-${c.slug}.jpg`}><Download className="size-4" />{t("share.download")}</a></Button>}
        {imageError && <div className="space-y-2"><p className="text-sm text-destructive">{t("share.imageError")}</p><Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t("share.retry")}</Button></div>}
        {!image && !imageError && <p className="text-muted-foreground">{t("common.loading")}</p>}
      </section>

      <Button className="mt-6 w-full" variant="secondary" onClick={() => navigate({ to: "/manage/$id", params: { id: c.id } })}>
        {t("new.goManage")}
      </Button>
      <p className="mt-4 text-center text-sm">
        <Link to="/dashboard" className="text-primary hover:underline">{t("nav.dashboard")}</Link>
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
