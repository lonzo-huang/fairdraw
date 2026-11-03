import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { computeProgress, parseConditions, type Metrics } from "@/lib/conditions";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ArrowUpRight } from "lucide-react";
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
  const { data, isLoading } = useQuery({
    queryKey: ["campaign", slug],
    // Pool progress is re-displayed every 15 minutes.
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: c } = await supabase.from("campaigns").select("*").eq("slug", slug).maybeSingle();
      if (!c) return null;
      const { data: count } = await supabase.rpc("entry_count", { _campaign_id: c.id });
      const [{ data: snap }, { data: snapFirst }] = await Promise.all([
        supabase.from("condition_snapshots").select("metrics, progress, fetched_at").eq("campaign_id", c.id).order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("condition_snapshots").select("metrics, fetched_at").eq("campaign_id", c.id).order("fetched_at", { ascending: true }).limit(1).maybeSingle(),
      ]);
      return { c, count: count ?? 0, snap, snapFirst };
    },
  });
  const cd = useCountdown(data?.c?.ends_at);

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  if (!data) return <p className="p-10 text-center text-muted-foreground">404</p>;
  const { c, count } = data;
  const closed = c.status !== "open" || (cd ? cd.ms === 0 : false);

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:grid-cols-[1.3fr_1fr]">
      <div>
        <StatusBadge status={c.status} endsAt={c.ends_at} />
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{c.title}</h1>
        {c.description && <p className="mt-4 whitespace-pre-line text-muted-foreground">{c.description}</p>}
        {c.requirement && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground">{t("f.req")}</p>
            <p className="mt-2 whitespace-pre-line">{c.requirement}</p>
          </div>
        )}
        {(c.target_url || c.tweet_url) && (
          <div className="mt-6 flex flex-wrap gap-5 text-sm">
            {c.target_url && <a href={`/go/${c.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"><ArrowUpRight className="size-3.5" />{t("c.visit")}</a>}
            {c.tweet_url && <a href={c.tweet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"><span className="font-black">𝕏</span>{t("m.tweetUrl")}</a>}
          </div>
        )}
        <PostStats metrics={data.snap?.metrics as Metrics | null | undefined} firstMetrics={data.snapFirst?.metrics} fetchedAt={data.snap?.fetched_at} />
        <ConditionProgress conditionsRaw={c.conditions} participants={count} snap={data.snap} />
        {share.imageUrl && <details className="mt-6"><summary className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground">{t("c.sharePreview")}</summary><img src={share.imageUrl} alt={translate(c.share_language === "en" ? "en" : "zh", "share.imageAlt", { title: c.title, prize: c.prize })} width={1200} height={630} className="mt-3 aspect-[1200/630] w-full rounded-lg border border-border object-contain" /></details>}
      </div>

      <div className="space-y-5">
        <div className="ticket p-6">
          <p className="text-xs font-medium text-muted-foreground">{t("cy.total")}</p>
          <p className="mt-1 font-display text-3xl font-bold">{c.prize_amount ? `${c.prize_amount} ${c.currency}` : c.prize}</p>
          <p className="mt-1 text-sm opacity-70">{c.winners_count} {t("c.winners")}</p>
          <div className="perforation my-4" />
          <div className="rounded-lg bg-background/60 px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{t("c.countdownLabel")}</p>
            <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">{cd && !closed ? cd.text : t("c.closed")}</p>
          </div>
          <p className="mt-3 text-center font-mono text-sm"><span className="font-semibold text-prize">{count}</span> {t("c.participants")}</p>
        </div>

        {c.status === "drawn" ? (
          <Button asChild className="w-full"><Link to="/r/$slug" params={{ slug }}>{t("c.result")}</Link></Button>
        ) : closed ? (
          <p className="text-center text-muted-foreground">{t("c.closed")}</p>
        ) : (
          <p className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center text-sm text-muted-foreground">{t("c.replyToJoin")}</p>
        )}
        <Button variant="ghost" className="w-full" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success(t("c.copied")); }}>
          {t("c.share")}
        </Button>
      </div>
    </div>
  );
}

const fmtCompact = (v: number) => v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Every collectible X metric for the campaign post; null values stay hidden as —. */
function PostStats({ metrics, firstMetrics, fetchedAt }: { metrics: Metrics | null | undefined; firstMetrics: unknown; fetchedAt?: string }) {
  const { t } = useI18n();
  if (!metrics) return null;
  const fm = (firstMetrics ?? null) as Metrics | null;
  const newFollowers = typeof metrics.followers === "number" && typeof fm?.followers === "number" ? Math.max(0, metrics.followers - fm.followers) : null;
  const cells: { label: string; value: string }[] = [
    { label: t("cond.likes"), value: typeof metrics.likes === "number" ? fmtCompact(metrics.likes) : "—" },
    { label: t("cond.replies"), value: typeof metrics.replies === "number" ? fmtCompact(metrics.replies) : "—" },
    { label: t("cond.reposts"), value: typeof metrics.reposts === "number" ? fmtCompact(metrics.reposts) : "—" },
    { label: t("cond.quotes"), value: typeof metrics.quotes === "number" ? fmtCompact(metrics.quotes) : "—" },
    { label: t("stat.bookmarks"), value: typeof metrics.bookmarks === "number" ? fmtCompact(metrics.bookmarks) : "—" },
    { label: t("cy.exposure"), value: typeof metrics.views === "number" ? fmtCompact(metrics.views) : "—" },
    { label: t("stat.newFollowers"), value: newFollowers === null ? "—" : `+${fmtCompact(newFollowers)}` },
  ];
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{t("stat.title")}</p>
        {fetchedAt && <span className="text-[10px] text-muted-foreground">{new Date(fetchedAt).toLocaleString()}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-lg bg-background/60 px-3 py-2.5 text-center">
            <dd className="font-mono text-lg font-semibold tabular-nums">{cell.value}</dd>
            <dt className="mt-0.5 text-[10px] text-muted-foreground">{cell.label}</dt>
          </div>
        ))}
      </dl>
    </div>
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
        <p className="text-xs font-medium text-muted-foreground">{t("cond.title")}</p>
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
