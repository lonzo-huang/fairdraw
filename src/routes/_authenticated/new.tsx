import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { type Conditions } from "@/lib/conditions";
import { campaignTweet, prizeSummary, type ShareCampaign } from "@/lib/campaign-share";
import { renderShareImage } from "@/lib/campaign-share-image";
import { Download } from "lucide-react";
import { feeAmount, feeRate } from "@/lib/fees";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
import { CURRENCIES, DURATIONS, endsAtFromDays } from "@/lib/plans";
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

type Created = ShareCampaign & { id: string; ends_at: string };

function NewCampaign() {
  const { t, lang } = useI18n();
  const { data: fees = [] } = useFeeTiers();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [f, setF] = useState({
    title: "",
    description: "",
    prize: "",
    prize_amount: "",
    currency: "USDT",
    winners_count: 1,
    days: "3",
    requirement: "",
    questions: "",
    target_url: "",
    tweet_url: "",
    keyword: "",
    min_likes: "",
    min_replies: "",
    min_reposts: "",
    min_participants: "",
    min_verified: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const conditions: Conditions = {};
    if (f.keyword.trim()) conditions.keyword = f.keyword.trim();
    if (f.min_likes) conditions.min_likes = Number(f.min_likes);
    if (f.min_replies) conditions.min_replies = Number(f.min_replies);
    if (f.min_reposts) conditions.min_reposts = Number(f.min_reposts);
    if (f.min_participants) conditions.min_participants = Number(f.min_participants);
    if (f.min_verified) conditions.min_verified = Number(f.min_verified);
    const amount = f.prize_amount ? Number(f.prize_amount) : null;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); toast.error(t("c.signin")); return; }
    const winners = Math.max(1, Number(f.winners_count) || 1);
    const generatedPrize = prizeSummary({ title: f.title, slug: "", prize: f.prize.trim(), prize_amount: amount, currency: f.currency, winners_count: winners, share_language: lang });
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        owner_id: u.user.id,
        title: f.title.trim(),
        description: f.description.trim(),
        prize: amount && amount > 0 ? generatedPrize : f.prize.trim(),
        prize_amount: amount,
        currency: f.currency.trim() || "USDT",
        // Pre-authorize the pool at creation; it stays locked until draw (charge) or refund.
        escrow_status: amount && amount > 0 ? "preauthorized" : "none",
        winners_count: winners,
        share_language: lang,
        share_duration: Number(f.days),
        ends_at: endsAtFromDays(Number(f.days)),
        requirement: f.requirement.trim(),
        questions: f.questions.split("\n").map((q) => q.trim()).filter(Boolean),
        target_url: f.target_url.trim() || null,
        tweet_url: f.tweet_url.trim() || null,
        conditions,
      })
      .select("id, slug, title, prize, ends_at, prize_amount, currency, winners_count, share_language, share_duration, conditions, requirement")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("WEEKLY_LIMIT") ? t("f.limit") : error.message);
      return;
    }
    setCreated(data);
  }

  if (created) return <AfterCreate c={created} />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-4xl font-semibold">{t("new.title")}</h1>
      <form onSubmit={submit} className="mt-8 space-y-5 rounded-xl border border-border bg-card p-6">
        <Field label={t("f.title")}><Input required maxLength={120} value={f.title} onChange={set("title")} /></Field>
        <Field label={t("f.desc")}><Textarea rows={4} maxLength={2000} value={f.description} onChange={set("description")} /></Field>
        <Field label={t("f.prize")}><Input required={!f.prize_amount || Number(f.prize_amount) <= 0} readOnly={Number(f.prize_amount) > 0} maxLength={200} placeholder={t("f.prizePh")} value={Number(f.prize_amount) > 0 ? prizeSummary({ title: f.title, slug: "", prize: f.prize, prize_amount: Number(f.prize_amount), currency: f.currency, winners_count: Number(f.winners_count) || 1, share_language: lang }) : f.prize} onChange={set("prize")} /></Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("f.amount")}><Input type="number" min={0} step="0.01" placeholder="20" value={f.prize_amount} onChange={set("prize_amount")} /></Field>
          <Field label={t("f.currency")}><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={f.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        </div>
        {f.prize_amount && Number(f.prize_amount) > 0 && (
          <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">{t("fee.estimate")}: {feeRate(fees, Number(f.prize_amount))}% · {feeAmount(fees, Number(f.prize_amount))} {f.currency}<br />{t("f.escrowNote")}</p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("f.winners")}><><Input type="number" min={1} max={100} required list="winner-options" value={f.winners_count} onChange={set("winners_count")} /><datalist id="winner-options">{[1, 2, 3, 5, 10, 20, 50, 100].map((n) => <option key={n} value={n} />)}</datalist></></Field>
          <Field label={t("f.ends")}><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={f.days} onChange={set("days")}>{DURATIONS.map((d) => <option key={d} value={d}>{t(`f.day${d}` as "f.day1")}</option>)}</select></Field>
        </div>
        <Field label={t("f.req")}><Textarea rows={3} maxLength={1000} placeholder={t("f.reqPh")} value={f.requirement} onChange={set("requirement")} /></Field>
        <Field label={t("f.questions")}><Textarea rows={3} value={f.questions} onChange={set("questions")} /></Field>
        <Field label={t("f.target")}><Input type="url" placeholder="https://" value={f.target_url} onChange={set("target_url")} /></Field>

        <div className="rounded-xl border border-border p-4">
          <p className="font-medium">{t("f.tweetTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("f.tweetHint")}</p>
          <div className="mt-3">
            <Field label={t("f.tweetUrl")}><Input type="url" placeholder="https://x.com/you/status/…" value={f.tweet_url} onChange={set("tweet_url")} /></Field>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="font-medium">{t("f.condTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("f.condHint")}</p>
          <div className="mt-3 space-y-4">
            <Field label={t("f.keyword")}><Input maxLength={100} value={f.keyword} onChange={set("keyword")} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("f.minLikes")}><Input type="number" min={0} value={f.min_likes} onChange={set("min_likes")} /></Field>
              <Field label={t("f.minReplies")}><Input type="number" min={0} value={f.min_replies} onChange={set("min_replies")} /></Field>
              <Field label={t("f.minReposts")}><Input type="number" min={0} value={f.min_reposts} onChange={set("min_reposts")} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("f.minParticipants")}><Input type="number" min={0} value={f.min_participants} onChange={set("min_participants")} /></Field>
              <Field label={t("f.minVerified")}><Input type="number" min={0} value={f.min_verified} onChange={set("min_verified")} /></Field>
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={busy}>{t("f.publish")}</Button>
      </form>
    </div>
  );
}

/** After creation: jump to X with the tweet pre-filled, or go manage the campaign. */
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
        <p className="font-mono text-xs uppercase tracking-widest text-primary">{t("new.tweetPreview")}</p>
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
