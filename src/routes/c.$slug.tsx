import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { detectPlatform } from "@/lib/plans";
import { computeProgress, parseConditions, type Metrics } from "@/lib/conditions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { getCampaignShare } from "@/lib/campaign-share.functions";
import { conditionSummary, prizeSummary } from "@/lib/campaign-share";
import { translate } from "@/lib/i18n";

export const Route = createFileRoute("/c/$slug")({
  loader: ({ params }) => getCampaignShare({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const c = loaderData?.c;
    const title = c ? `${c.title} — FairDraw` : "Giveaway — FairDraw";
    const description = c ? `${prizeSummary(c)}。${conditionSummary(c)}` : "Enter this verifiable giveaway on FairDraw.";
    const image = loaderData?.imageUrl;
    return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(image?.startsWith("https://") ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }, { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" }] : []),
    ],
  }; },
  component: CampaignPage,
});

function useCountdown(end: string | undefined) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (!end || now === null) return null;
  const ms = Math.max(0, new Date(end).getTime() - now);
  const d = Math.floor(ms / 864e5), h = Math.floor((ms / 36e5) % 24), m = Math.floor((ms / 6e4) % 60), s = Math.floor((ms / 1e3) % 60);
  return { ms, text: `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
}

function CampaignPage() {
  const { slug } = Route.useParams();
  const share = Route.useLoaderData();
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["campaign", slug, user?.id],
    // Pool progress is re-displayed every 15 minutes.
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: c } = await supabase.from("campaigns").select("*").eq("slug", slug).maybeSingle();
      if (!c) return null;
      const { data: count } = await supabase.rpc("entry_count", { _campaign_id: c.id });
      const { data: snap } = await supabase
        .from("condition_snapshots")
        .select("metrics, progress, fetched_at")
        .eq("campaign_id", c.id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let mine = null;
      if (user) mine = (await supabase.from("entries").select("id").eq("campaign_id", c.id).eq("user_id", user.id).maybeSingle()).data;
      return { c, count: count ?? 0, mine, snap };
    },
  });
  const cd = useCountdown(data?.c?.ends_at);

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  if (!data) return <p className="p-10 text-center text-muted-foreground">404</p>;
  const { c, count, mine } = data;
  const closed = c.status !== "open" || (cd ? cd.ms === 0 : false);
  const questions = (c.questions as string[]) ?? [];

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:grid-cols-[1.3fr_1fr]">
      <div>
        <StatusBadge status={c.status} endsAt={c.ends_at} />
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{c.title}</h1>
        <p className="mt-4 whitespace-pre-line text-muted-foreground">{c.description}</p>
        {c.requirement && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">{t("f.req")}</p>
            <p className="mt-2 whitespace-pre-line">{c.requirement}</p>
          </div>
        )}
        {c.target_url && (
          <Button asChild variant="outline" className="mt-6">
            <a href={`/go/${c.slug}`} target="_blank" rel="noreferrer">{t("c.visit")} ↗</a>
          </Button>
        )}
        {c.tweet_url && (
          <Button asChild variant="outline" className="mt-3">
            <a href={c.tweet_url} target="_blank" rel="noreferrer">𝕏 {t("m.tweetUrl")} ↗</a>
          </Button>
        )}
        <ConditionProgress conditionsRaw={c.conditions} participants={count} snap={data.snap} />
        {share.imageUrl && <img src={share.imageUrl} alt={translate(c.share_language === "en" ? "en" : "zh", "share.imageAlt", { title: c.title, prize: c.prize })} width={1200} height={630} className="mt-6 aspect-[1200/630] w-full rounded-lg border border-border object-contain" />}
      </div>

      <div className="space-y-5">
        <div className="ticket p-6">
          <p className="font-serif text-2xl font-semibold">{c.prize}</p>
          <p className="mt-1 text-sm opacity-70">{c.winners_count} {t("c.winners")}</p>
          <div className="perforation my-4" />
          <div className="flex justify-between font-mono text-sm">
            <span>{count} {t("c.participants")}</span>
            <span>{cd && !closed ? `${cd.text} ${t("c.left")}` : t("c.closed")}</span>
          </div>
        </div>

        {c.status === "drawn" ? (
          <Button asChild className="w-full"><Link to="/r/$slug" params={{ slug }}>{t("c.result")}</Link></Button>
        ) : closed ? (
          <p className="text-center text-muted-foreground">{t("c.closed")}</p>
        ) : !user ? (
          <Button asChild className="w-full"><Link to="/auth" search={{ redirect: `/c/${slug}` }}>{t("c.signin")}</Link></Button>
        ) : mine ? (
          <p className="rounded-xl border border-success/40 bg-success/10 p-4 text-center text-success">{t("c.entered")}</p>
        ) : (
          <EntryForm campaignId={c.id} userId={user.id} questions={questions} acceptsCrypto={c.currency === "USDT" && Number(c.prize_amount) > 0} onDone={() => qc.invalidateQueries({ queryKey: ["campaign", slug] })} />
        )}
        <Button variant="ghost" className="w-full" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success(t("c.copied")); }}>
          {t("c.share")}
        </Button>
      </div>
    </div>
  );
}

function EntryForm({ campaignId, userId, questions, acceptsCrypto, onDone }: { campaignId: string; userId: string; questions: string[]; acceptsCrypto: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const [handle, setHandle] = useState("");
  const [post, setPost] = useState("");
  const [wallet, setWallet] = useState("");
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const addr = wallet.trim();
    if (addr && !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      toast.error(t("c.walletBad"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("entries").insert({
      campaign_id: campaignId,
      user_id: userId,
      handle: handle.trim().slice(0, 60),
      post_url: post.trim(),
      platform: detectPlatform(post.trim()),
      payout_address: addr || null,
      answers: questions.map((q, i) => `${q} — ${answers[i]?.trim() ?? ""}`),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <p className="font-serif text-xl font-semibold">{t("c.enter")}</p>
      <div className="space-y-1.5"><Label>{t("c.handle")}</Label><Input required value={handle} onChange={(e) => setHandle(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>{t("c.post")}</Label><Input required type="url" placeholder="https://x.com/…" value={post} onChange={(e) => setPost(e.target.value)} /></div>
      {acceptsCrypto && (
        <div className="space-y-1.5">
          <Label>{t("c.wallet")}</Label>
          <Input placeholder="0x…" value={wallet} onChange={(e) => setWallet(e.target.value)} className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">{t("c.walletHint")}</p>
        </div>
      )}
      {questions.map((q, i) => (
        <div key={i} className="space-y-1.5">
          <Label>{q}</Label>
          <Input required maxLength={500} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
        </div>
      ))}
      <Button type="submit" className="w-full" disabled={busy}>{t("c.submit")}</Button>
    </form>
  );
}

/** Public condition progress bar. Uses the latest snapshot when present, otherwise live counts. */
function ConditionProgress({
  conditionsRaw,
  participants,
  snap,
}: {
  conditionsRaw: unknown;
  participants: number;
  snap: { metrics: unknown; progress: number; fetched_at: string } | null;
}) {
  const { t } = useI18n();
  const conditions = parseConditions(conditionsRaw);
  if (Object.values(conditions).every((v) => v === undefined)) return null;

  const metrics = (snap?.metrics ?? null) as Metrics | null;
  const { checks, progress } = metrics
    ? computeProgress(conditions, { ...metrics, participants })
    : computeProgress(conditions, { likes: null, replies: null, reposts: null, keyword_found: null, participants, verified: 0 });

  const labelFor = (label: string) => t(`cond.${label}` as Parameters<typeof t>[0]);

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">{t("cond.title")}</p>
        <span className="font-mono text-sm font-semibold">{progress}%</span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {checks.map((ch) => (
          <li key={ch.key} className="flex items-center justify-between text-sm">
            <span>
              {labelFor(ch.label)} <span className="text-muted-foreground">≥ {ch.target}</span>
              {typeof ch.current === "number" && <span className="ml-2 font-mono text-muted-foreground">({ch.current})</span>}
            </span>
            <span className={ch.state === "met" ? "text-success" : ch.state === "unmet" ? "text-muted-foreground" : "text-accent-foreground"}>
              {ch.state === "met" ? `✓ ${t("cond.met")}` : ch.state === "unmet" ? t("cond.unmet") : t("cond.unknown")}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("cond.refresh")}
        {snap && ` · ${new Date(snap.fetched_at).toLocaleString()}`}
      </p>
    </div>
  );
}
