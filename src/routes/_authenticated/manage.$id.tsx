import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { CANCEL_WINDOW_MS, cancelCampaign, checkCampaignConditions, drawCampaign, refundEscrow, updateCampaignConditions } from "@/lib/campaign.functions";
import { payoutViaStripe, recordChainPayout, refundChainEscrow, updateCampaignAmount } from "@/lib/payment.functions";
import { computeProgress, parseConditions, type ConditionCheck, type Conditions, type Metrics } from "@/lib/conditions";
import { campaignTweet } from "@/lib/campaign-share";
import { hasEthereum, sendTokenTransfer } from "@/lib/wallet";
import { FundingPanel } from "@/components/funding-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowUpRight, Clock3, Copy, Link2, MoreHorizontal, Users, Wallet } from "lucide-react";

export const NUM_COND_KEYS = ["min_likes", "min_replies", "min_reposts", "min_quotes", "min_views", "min_participants", "min_verified"] as const;
const COND_LABEL: Record<(typeof NUM_COND_KEYS)[number], "cond.likes" | "cond.replies" | "cond.reposts" | "cond.quotes" | "cond.views" | "cond.participants" | "cond.verified"> = {
  min_likes: "cond.likes", min_replies: "cond.replies", min_reposts: "cond.reposts",
  min_quotes: "cond.quotes", min_views: "cond.views",
  min_participants: "cond.participants", min_verified: "cond.verified",
};

export const Route = createFileRoute("/_authenticated/manage/$id")({
  head: () => ({ meta: [
    { title: "Manage campaign — FairDraw" },
    { name: "description", content: "Review participants, draw winners and record payout proof on FairDraw." },
    { property: "og:title", content: "Manage campaign — FairDraw" },
    { property: "og:description", content: "Review participants, draw winners and record payout proof on FairDraw." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Manage,
});

function Manage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const checkConds = useServerFn(checkCampaignConditions);
  const refund = useServerFn(refundEscrow);
  const cancel = useServerFn(cancelCampaign);
  const draw = useServerFn(drawCampaign);
  const updateAmount = useServerFn(updateCampaignAmount);
  const [busy, setBusy] = useState(false);
  const [condResult, setCondResult] = useState<{ checks: ConditionCheck[]; progress: number } | null>(null);
  const [tweetUrl, setTweetUrl] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string | null>(null);
  const [editConds, setEditConds] = useState(false);
  const [drawMode, setDrawMode] = useState<"all" | "verified" | "weighted">("all");
  const [wBlue, setWBlue] = useState("1.2");
  const [wNormal, setWNormal] = useState("0.4");
  const [shownRows, setShownRows] = useState(25);
  const [entryTab, setEntryTab] = useState<"all" | "valid" | "invalid">("all");
  const [amountOpen, setAmountOpen] = useState(false);
  const [postEdit, setPostEdit] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["manage", id],
    queryFn: async () => {
      const [{ data: c }, { data: entries }, { data: payouts }, { data: snap }] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id).single(),
        supabase.from("entries").select("*").eq("campaign_id", id).order("created_at"),
        supabase.from("payouts").select("*").eq("campaign_id", id),
        // Latest cron check snapshot — lets the progress card render without a manual check.
        supabase.from("condition_snapshots").select("fetched_at, metrics").eq("campaign_id", id).order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { c, entries: entries ?? [], payouts: payouts ?? [], snap };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["manage", id] });

  if (isLoading || !data?.c) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  const { c, entries, payouts, snap } = data;
  const open = c.status === "open";
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/c/${c.slug}` : "";
  const conditions = parseConditions(c.conditions);
  const hasConds = Object.values(conditions).some((v) => v !== undefined);
  const snapM = (snap?.metrics ?? null) as Metrics | null;
  // A manual check outranks the latest cron snapshot until the next refresh.
  const cond = condResult ?? (snapM ? computeProgress(conditions, snapM) : null);
  const allMet = !hasConds || (cond !== null && cond.checks.length > 0 && cond.checks.every((ch) => ch.state === "met"));
  const now = Date.now();
  const pastDeadline = Date.parse(c.ends_at) < now;
  const leftMs = Math.max(0, Date.parse(c.ends_at) - now);
  const unfunded = !!c.prize_amount && (c.payment_method === "stripe" || c.payment_method === "chain") && c.escrow_status === "awaiting";
  const canCancel = open && Date.parse(c.created_at) + CANCEL_WINDOW_MS > now;
  const isInvalidEntry = (e: (typeof entries)[number]) =>
    e.eligibility_status === "ineligible" ||
    (e.fetched_meta as { handle_match?: boolean | null } | null)?.handle_match === false;
  const shownEntries = entryTab === "all" ? entries : entries.filter((e) => (entryTab === "invalid") === isInvalidEntry(e));
  // Draw gating mirrors the product flow: funded pool, participants, and either
  // all conditions met or the deadline reached (owners can relax conditions to end early).
  const drawBlock = !open ? null
    : entries.length === 0 ? t("m.drawNoEntries")
    : unfunded ? t("m.drawUnfunded")
    : hasConds && cond === null ? t("m.drawNoSync")
    : !allMet && !pastDeadline ? t("m.drawWaitConds")
    : null;
  const nextStep =
    c.status === "cancelled" ? t("m.nextCancelled")
    : c.status === "drawn" ? t("m.nextDrawn")
    : unfunded ? t("m.nextAwaiting")
    : !c.tweet_url ? t("m.nextLink")
    : hasConds && cond === null ? t("m.nextSync")
    : !allMet && !pastDeadline ? `${t("m.nextWait")} · ${fmtLeft(leftMs)}`
    : t("m.nextDraw");
  const copyShare = () => { navigator.clipboard.writeText(shareUrl); toast.success(t("c.copied")); };
  const condSummary = !hasConds ? t("m.ovNoConds")
    : NUM_COND_KEYS.filter((k) => conditions[k] !== undefined).map((k) => `${t(COND_LABEL[k])}≥${conditions[k]}`)
      .concat(conditions.keyword ? `${t("cond.keyword")}:${conditions.keyword}` : [])
      .join(" · ");

  async function doDraw() {
    if (!confirm(t("m.drawConfirm"))) return;
    setBusy(true);
    try {
      await draw({
        data: {
          campaignId: c!.id,
          mode: drawMode,
          weights: drawMode === "weighted"
            ? { blue: Number(wBlue) || 1, normal: Number(wNormal) || 1 }
            : undefined,
        },
      });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runCondCheck() {
    setBusy(true);
    try {
      const r = await checkConds({ data: { campaignId: c!.id } });
      if (r.deleted) {
        toast.error(t("m.tweetGone"));
        refresh();
        return;
      }
      setCondResult({ checks: r.checks as ConditionCheck[], progress: r.progress });
      toast.success(`${r.progress}%`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveTweet() {
    if (tweetUrl === null) return;
    const { error } = await supabase.from("campaigns").update({ tweet_url: tweetUrl.trim() || null }).eq("id", c!.id);
    if (error) toast.error(error.message);
    else toast.success(t("common.save"));
    setTweetUrl(null);
    refresh();
  }
  async function doUpdateAmount() {
    const n = Number(editAmount ?? c!.prize_amount);
    if (!(n > 0)) { toast.error("Invalid amount"); return; }
    setBusy(true);
    try {
      const r = await updateAmount({ data: { campaignId: c!.id, amount: n, origin: window.location.origin } });
      if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
      toast.success(t("common.save"));
      setEditAmount(null);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function doCancel() {
    if (!confirm(t("m.cancelConfirm"))) return;
    setBusy(true);
    try {
      await cancel({ data: { campaignId: c!.id } });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function doRefund() {
    if (!confirm(t("m.refundConfirm"))) return;
    setBusy(true);
    try {
      await refund({ data: { campaignId: c!.id } });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function del() {
    if (!confirm(t("m.delete") + "?")) return;
    await supabase.from("campaigns").delete().eq("id", c!.id);
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header: campaign identity + status */}
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("m.breadcrumb")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold">{c.title}</h1>
        <StatusBadge status={c.status} endsAt={c.ends_at} />
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{t("m.typeReply")}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="font-mono">ID {c.id.slice(0, 10)}</span>
        <button type="button" className="inline-flex items-center gap-1 font-mono text-primary hover:underline" onClick={copyShare}>
          {`/c/${c.slug}`}<Copy className="size-3" />
        </button>
      </div>

      {/* Actions: primary / secondary / destructive menu */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {c.tweet_url && (
          <Button asChild size="sm">
            <a href={c.tweet_url} target="_blank" rel="noopener noreferrer">{t("m.viewPost")}<ArrowUpRight className="size-4" /></a>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={copyShare}>{t("c.share")}</Button>
        {open && <Button variant="outline" size="sm" onClick={() => setEditConds((v) => !v)}>{t("m.editConds")}</Button>}
        {c.status === "drawn" && <Button asChild variant="outline" size="sm"><Link to="/r/$slug" params={{ slug: c.slug }}>{t("c.result")}</Link></Button>}
        {open && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm"><MoreHorizontal className="size-4" />{t("m.more")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canCancel && <DropdownMenuItem disabled={busy} onClick={doCancel} className="text-destructive focus:text-destructive">{t("m.cancel")}</DropdownMenuItem>}
              {canCancel && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={del} className="text-destructive focus:text-destructive">{t("m.delete")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Next step banner — the state flow is always visible */}
      <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm">
        {open && <span className="live-dot" />}
        <span className="shrink-0 font-medium">{t("m.nextLabel")}</span>
        <span className="text-muted-foreground">{nextStep}</span>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-6">
          {/* X post integration — the first step in the campaign flow sits on top */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xl font-semibold"><Link2 className="size-5" />{t("m.postTitle")}</h2>
              {c.tweet_url && !postEdit && <Button variant="ghost" size="sm" onClick={() => setPostEdit(true)}>{t("m.postChange")}</Button>}
            </div>
            {c.tweet_url && !postEdit ? (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {snapM?.author_name ?? t("m.postLinked")}
                    {snapM?.author_handle ? <span className="ml-1 font-mono text-xs text-muted-foreground">@{snapM.author_handle}</span> : null}
                  </p>
                  {snapM?.post_text && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{snapM.post_text}</p>}
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{c.tweet_url}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <a href={c.tweet_url} target="_blank" rel="noopener noreferrer">{t("m.openPost")}<ArrowUpRight className="size-4" /></a>
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="https://x.com/you/status/…"
                    value={tweetUrl ?? c.tweet_url ?? ""}
                    onChange={(e) => setTweetUrl(e.target.value)}
                  />
                  <Button size="sm" variant="secondary" onClick={saveTweet} disabled={tweetUrl === null}>{t("m.postLinkAction")}</Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("m.postHint")}</p>
                {open && !c.tweet_url && (c.escrow_status === "funded" || c.escrow_status === "preauthorized" || c.escrow_status === "charged" || c.payment_method === "manual") && (
                  <a
                    href={`https://x.com/intent/post?text=${encodeURIComponent(campaignTweet(c, typeof window !== "undefined" ? window.location.origin : ""))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >{t("new.postToX")}<ArrowUpRight className="size-4" /></a>
                )}
              </div>
            )}
          </section>

          {/* Campaign progress */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{t("m.progressTitle")}</h2>
              <Button variant="outline" size="sm" disabled={busy} onClick={runCondCheck}>{t("m.checkConditions")}</Button>
            </div>
            {open && editConds && <ConditionEditor c={c} onDone={refresh} />}
            {!hasConds ? (
              <p className="mt-4 text-sm text-muted-foreground">{t("cond.none")}</p>
            ) : cond === null ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><span className="live-dot" />{t("m.noSnap")}</p>
            ) : (
              <div className="mt-4">
                <div className="flex items-end gap-3">
                  <span className="font-mono text-4xl font-semibold">{cond.progress}%</span>
                  <span className="pb-1 text-sm text-muted-foreground">{t("m.done")}</span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${cond.progress}%` }} />
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {cond.checks.map((ch) => (
                    <li key={ch.key} className="flex items-center justify-between gap-3">
                      <span>
                        {t(`cond.${ch.label}` as Parameters<typeof t>[0])}{" "}
                        <span className="font-mono text-muted-foreground">
                          {typeof ch.current === "number" ? ch.current : "—"} / {ch.target}
                        </span>
                      </span>
                      <span className={ch.state === "met" ? "text-success" : "text-muted-foreground"}>
                        {ch.state === "met" ? `✓ ${t("cond.met")}`
                          : ch.state === "unmet" && typeof ch.current === "number" && typeof ch.target === "number"
                            ? `${t("m.remaining")} ${Math.max(0, ch.target - ch.current)}`
                            : ch.state === "unmet" ? t("cond.unmet") : t("cond.unknown")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" />
              {pastDeadline ? t("m.ended") : `${t("m.timeLeft")} ${fmtLeft(leftMs)}`}
              {snap && <span className="ml-auto">{t("m.lastSync")} {new Date(snap.fetched_at).toLocaleTimeString()}</span>}
            </div>
          </section>

          {/* Participants + draw */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xl font-semibold"><Users className="size-5" />{t("m.partyTitle")}</h2>
              <div className="flex gap-1 rounded-lg border border-border p-0.5 text-xs">
                {(["all", "valid", "invalid"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEntryTab(k)}
                    className={`rounded-md px-2.5 py-1 transition-colors ${entryTab === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t(k === "all" ? "m.tabAll" : k === "valid" ? "m.tabValid" : "m.tabInvalid")}
                    {" "}{k === "all" ? entries.length : entries.filter((e) => (k === "invalid") === isInvalidEntry(e)).length}
                  </button>
                ))}
              </div>
            </div>
            {open && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                  value={drawMode}
                  onChange={(e) => setDrawMode(e.target.value as typeof drawMode)}
                >
                  <option value="all">{t("m.modeAll")}</option>
                  <option value="verified">{t("m.modeVerified")}</option>
                  <option value="weighted">{t("m.modeWeighted")}</option>
                </select>
                {drawMode === "weighted" && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    {t("m.wBlue")}
                    <Input className="h-9 w-16" value={wBlue} onChange={(e) => setWBlue(e.target.value)} />
                    {t("m.wNormal")}
                    <Input className="h-9 w-16" value={wNormal} onChange={(e) => setWNormal(e.target.value)} />
                  </span>
                )}
                <Button size="sm" disabled={busy || drawBlock !== null} onClick={doDraw}>{t("m.draw")}</Button>
                {drawBlock && <span className="text-xs text-muted-foreground">{drawBlock}</span>}
                {!drawBlock && !allMet && <span className="text-xs text-warning">{t("m.drawUnmet")}</span>}
              </div>
            )}
            {entries.length === 0 ? (
              <p className={`mt-4 text-sm ${open ? "flex items-center gap-2 text-muted-foreground" : "text-muted-foreground"}`}>{open && <span className="live-dot" />}{t(open ? "m.importing" : "m.noEntries")}</p>
            ) : (
              <>
                {open && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><span className="live-dot" />{t("m.importing")}</p>}
                <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="w-10 px-4 py-3 font-medium">#</th>
                        <th className="px-4 py-3 font-medium">{t("m.colName")}</th>
                        <th className="px-4 py-3 font-medium">@</th>
                        <th className="px-4 py-3 font-medium">{t("m.blueV")}</th>
                        <th className="px-4 py-3 font-medium">{t("m.colTime")}</th>
                        <th className="px-4 py-3 font-medium">{t("m.colReply")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {shownEntries.slice(0, shownRows).map((e, i) => {
                        const meta = e.fetched_meta as { author_name?: string; text?: string; handle_match?: boolean | null; reply_time?: string; x_verified?: boolean | null } | null;
                        const answers = (e.answers as string[]) ?? [];
                        return (
                          <tr key={e.id} className="align-top">
                            <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                            <td className="max-w-[10rem] truncate px-4 py-3 font-medium">{meta?.author_name ?? "—"}</td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-muted-foreground">
                              @{e.handle}
                              {meta?.handle_match === false && <span className="ml-1 text-xs text-destructive">⚠</span>}
                            </td>
                            <td className="px-4 py-3">{meta?.x_verified === true ? <span className="text-xs font-medium text-sky-500">✓ {t("m.blueV")}</span> : "—"}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{meta?.reply_time ? new Date(meta.reply_time).toLocaleString() : "—"}</td>
                            <td className="max-w-xs px-4 py-3 text-muted-foreground">
                              <a href={e.post_url} target="_blank" rel="noreferrer" className="hover:text-primary">
                                {meta?.text ?? e.post_url}
                              </a>
                              {answers.map((a, i) => <p key={i}>• {a}</p>)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {shownEntries.length > shownRows && (
                  <div className="mt-3 text-center">
                    <Button variant="outline" size="sm" onClick={() => setShownRows((s) => s + 25)}>
                      {t("m.loadMore")}（{shownEntries.length - shownRows}）
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        {/* Side column: funding + overview */}
        <aside className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Wallet className="size-4" />{t("m.fundTitle")}</h2>
            <div className="mt-3">
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs">
                {t(`escrow.${c.escrow_status}` as Parameters<typeof t>[0])}
              </span>
              <p className="mt-3 font-mono text-3xl font-semibold">
                {c.prize_amount ?? "—"}{c.prize_amount ? ` ${c.currency}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`pay.${c.payment_method ?? "manual"}` as Parameters<typeof t>[0])}
              </p>
            </div>
            {canCancel && c.prize_amount !== null && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => { setEditAmount(String(c.prize_amount)); setAmountOpen(true); }}>{t("m.fundAdjust")}</Button>
            )}
            {open && (c.escrow_status === "preauthorized" || (c.escrow_status === "funded" && c.payment_method !== "chain")) && pastDeadline && (
              <Button variant="outline" size="sm" className="mt-4" disabled={busy} onClick={doRefund}>{t("m.refund")}</Button>
            )}
          </section>
          {c.escrow_status === "awaiting" && c.prize_amount && c.prize_amount > 0 && (
            <FundingPanel c={c} busy={busy} setBusy={setBusy} onDone={refresh} />
          )}
          {(c.escrow_status === "refund_pending" || (open && c.escrow_status === "funded" && c.payment_method === "chain" && pastDeadline)) && (
            <ChainRefund campaignId={c.id} busy={busy} setBusy={setBusy} onDone={refresh} />
          )}

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{t("m.overview")}</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("m.ovPrize")}</dt>
                <dd className="text-right">{c.prize || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("m.ovWinners")}</dt>
                <dd>{c.winners_count}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("m.ovEnds")}</dt>
                <dd className="font-mono text-xs">{new Date(c.ends_at).toLocaleString()}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">{t("m.ovConds")}</dt>
                <dd className="text-right text-xs">{condSummary}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      {payouts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-semibold">{t("m.payouts")}</h2>
          <div className="mt-4 space-y-3">
            {payouts.map((p) => (
              <PayoutRow key={p.id} p={p} share={c.prize_amount && c.winners_count > 0 ? Number(c.prize_amount) / c.winners_count : null} currency={c.currency} paymentMethod={c.payment_method} onDone={refresh} />
            ))}
          </div>
        </section>
      )}

      {/* Pool amount change lives in a dialog — not inline */}
      <Dialog open={amountOpen} onOpenChange={setAmountOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("m.fundAdjust")}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input type="number" min={0.01} step="0.01" value={editAmount ?? ""} onChange={(e) => setEditAmount(e.target.value)} />
            <Button size="sm" disabled={busy} onClick={doUpdateAmount}>{t("m.updateAmount")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Compact countdown for the progress card and next-step banner. */
function fmtLeft(ms: number): string {
  const m = Math.ceil(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/**
 * Looser-only conditions editor: every configured metric can be lowered or
 * removed, keyword can be removed — the server rejects tightening.
 */
function ConditionEditor({ c, onDone }: { c: { id: string; conditions: unknown }; onDone: () => void }) {
  const { t } = useI18n();
  const update = useServerFn(updateCampaignConditions);
  const init = parseConditions(c.conditions);
  const [vals, setVals] = useState<Record<string, string>>(
    () => Object.fromEntries(NUM_COND_KEYS.filter((k) => init[k] !== undefined).map((k) => [k, String(init[k])])) as Record<string, string>,
  );
  const [keyword, setKeyword] = useState(init.keyword ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const next: Conditions = {};
    if (keyword.trim()) next.keyword = keyword.trim();
    for (const k of NUM_COND_KEYS) {
      const n = Math.floor(Number(vals[k]));
      if (n > 0) next[k] = n;
    }
    setBusy(true);
    try {
      await update({ data: { campaignId: c.id, conditions: next } });
      toast.success(t("common.save"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{t("m.condLooserHint")}</p>
      {init.keyword !== undefined && (
        <div className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0">{t("cond.keyword")}</span>
          <Input className="h-8" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <Button size="sm" variant="ghost" onClick={() => setKeyword("")}>✕</Button>
        </div>
      )}
      {NUM_COND_KEYS.filter((k) => init[k] !== undefined).map((k) => (
        <div key={k} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0">{t(COND_LABEL[k])}</span>
          <span className="text-muted-foreground">≥</span>
          <Input type="number" min={1} className="h-8 w-24" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          {k !== "min_replies" && (
            <Button size="sm" variant="ghost" onClick={() => setVals({ ...vals, [k]: "" })}>✕</Button>
          )}
        </div>
      ))}
      <Button size="sm" disabled={busy} onClick={save}>{t("common.save")}</Button>
    </div>
  );
}

function ChainRefund({ campaignId, busy, setBusy, onDone }: { campaignId: string; busy: boolean; setBusy: (b: boolean) => void; onDone: () => void }) {
  const { t } = useI18n();
  const refundChain = useServerFn(refundChainEscrow);
  const [txHash, setTxHash] = useState("");
  async function run() {
    setBusy(true);
    try {
      await refundChain({ data: { campaignId, txHash: txHash.trim() } });
      toast.success(t("escrow.refunded"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row">
      <Input placeholder={`${t("m.chainRefund")} · tx hash`} value={txHash} onChange={(e) => setTxHash(e.target.value)} />
      <Button size="sm" variant="outline" disabled={busy || !txHash.trim()} onClick={run}>{t("m.chainRefund")}</Button>
    </div>
  );
}

function PayoutRow({ p, share, currency, paymentMethod, onDone }: { p: { id: string; winner_handle: string; status: string; proof: string | null; wallet_address?: string | null; stripe_account_id?: string | null; claim_info?: string | null }; share: number | null; currency: string; paymentMethod: string; onDone: () => void }) {
  const { t } = useI18n();
  const record = useServerFn(recordChainPayout);
  const payStripe = useServerFn(payoutViaStripe);
  const [proof, setProof] = useState(p.proof ?? "");
  const [wallet, setWallet] = useState(p.wallet_address ?? (/^0x[0-9a-fA-F]{40}$/.test(p.claim_info ?? "") ? p.claim_info!.trim() : ""));
  const [busy, setBusy] = useState(false);
  const canChainPay = currency === "USDT" && share !== null && share > 0 && p.status !== "paid";
  const canStripePay = paymentMethod === "stripe" && share !== null && share > 0 && p.status !== "paid";

  async function save() {
    const { error } = await supabase.from("payouts").update({ proof, status: proof ? "paid" : "pending", updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) toast.error(error.message);
    onDone();
  }
  async function payChain() {
    if (!hasEthereum()) { toast.error(t("m.noMetaMask")); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet.trim())) { toast.error(t("m.winnerWallet")); return; }
    setBusy(true);
    try {
      const hash = await sendTokenTransfer(wallet.trim() as `0x${string}`, share!);
      await record({ data: { payoutId: p.id, txHash: hash, walletAddress: wallet.trim() } });
      toast.success(t("r.paid"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function transferStripe() {
    setBusy(true);
    try {
      await payStripe({ data: { payoutId: p.id } });
      toast.success(t("r.paid"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="w-40 font-mono">{p.winner_handle}</span>
        <Input placeholder={t("m.proof")} value={proof} onChange={(e) => setProof(e.target.value)} />
        <Button size="sm" onClick={save}>{p.status === "paid" ? t("common.save") : t("m.markPaid")}</Button>
      </div>
      {p.claim_info && p.status !== "paid" && (
        <p className="break-all text-xs text-muted-foreground">
          {t("m.claimInfo")}: <span className="font-mono text-foreground">{p.claim_info}</span>
        </p>
      )}
      {canChainPay && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input placeholder={t("m.winnerWallet")} value={wallet} onChange={(e) => setWallet(e.target.value)} className="font-mono text-xs" />
          <Button size="sm" variant="secondary" disabled={busy} onClick={payChain}>
            {t("m.payOnchain")}{share !== null ? ` · ${share.toFixed(2)} USDT` : ""}
          </Button>
        </div>
      )}
      {canStripePay && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {p.stripe_account_id ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={transferStripe}>
              {t("m.payStripe")}{share !== null ? ` · ${share.toFixed(2)} ${currency}` : ""}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{t("m.awaitingClaim")}</p>
          )}
        </div>
      )}
    </div>
  );
}
