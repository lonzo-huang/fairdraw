import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { CANCEL_WINDOW_MS, cancelCampaign, checkCampaignConditions, checkEntries, drawCampaign, refundEscrow, updateCampaignConditions } from "@/lib/campaign.functions";
import { payoutViaStripe, recordChainPayout, refundChainEscrow, updateCampaignAmount } from "@/lib/payment.functions";
import { parseConditions, type ConditionCheck, type Conditions } from "@/lib/conditions";
import { campaignTweet } from "@/lib/campaign-share";
import { hasEthereum, sendTokenTransfer } from "@/lib/wallet";
import { FundingPanel } from "@/components/funding-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, EntryBadge } from "@/components/status-badge";

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
  const check = useServerFn(checkEntries);
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

  const { data, isLoading } = useQuery({
    queryKey: ["manage", id],
    queryFn: async () => {
      const [{ data: c }, { data: entries }, { data: payouts }] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id).single(),
        supabase.from("entries").select("*").eq("campaign_id", id).order("created_at"),
        supabase.from("payouts").select("*").eq("campaign_id", id),
      ]);
      return { c, entries: entries ?? [], payouts: payouts ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["manage", id] });

  if (isLoading || !data?.c) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  const { c, entries, payouts } = data;
  const open = c.status === "open";
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/c/${c.slug}` : "";

  async function runCheck(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await check({ data: { entryIds: ids } });
      toast.success(`${r.found} / ${r.checked}`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(entryId: string, status: "eligible" | "ineligible") {
    const { error } = await supabase.from("entries").update({ eligibility_status: status }).eq("id", entryId);
    if (error) toast.error(error.message);
    refresh();
  }
  async function doDraw() {
    if (!confirm(t("m.drawConfirm"))) return;
    setBusy(true);
    try {
      await draw({ data: { campaignId: c!.id } });
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
    <div className="mx-auto max-w-5xl px-4 py-12">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("m.title")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-semibold">{c.title}</h1>
        <StatusBadge status={c.status} endsAt={c.ends_at} />
      </div>
      <p className="mt-2 text-muted-foreground">{c.prize} · {c.winners_count} {t("c.winners")}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success(t("c.copied")); }}>
          {t("c.share")}
        </Button>
        <Button asChild variant="outline" size="sm"><Link to="/c/$slug" params={{ slug: c.slug }}>/c/{c.slug}</Link></Button>
        {!open && c.status !== "cancelled" && <Button asChild size="sm"><Link to="/r/$slug" params={{ slug: c.slug }}>{t("c.result")}</Link></Button>}
        {open && Date.parse(c.created_at) + CANCEL_WINDOW_MS > Date.now() && (
          <Button variant="destructive" size="sm" disabled={busy} onClick={doCancel}>{t("m.cancel")}</Button>
        )}
        {open && <Button variant="ghost" size="sm" onClick={del}>{t("m.delete")}</Button>}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full border border-border bg-card px-3 py-1 font-mono">
          {t(`escrow.${c.escrow_status}` as Parameters<typeof t>[0])}
          {c.prize_amount ? ` · ${c.prize_amount} ${c.currency}` : ""}
          {c.prize_amount ? ` · ${t(`pay.${c.payment_method}` as Parameters<typeof t>[0])}` : ""}
        </span>
        {open && (c.escrow_status === "preauthorized" || (c.escrow_status === "funded" && c.payment_method !== "chain")) && new Date(c.ends_at).getTime() < Date.now() && (
          <Button variant="outline" size="sm" disabled={busy} onClick={doRefund}>{t("m.refund")}</Button>
        )}
        {open && Date.parse(c.created_at) + CANCEL_WINDOW_MS > Date.now() && c.prize_amount !== null && (
          <span className="flex items-center gap-1">
            <Input
              type="number" min={0.01} step="0.01" className="h-8 w-28"
              value={editAmount ?? String(c.prize_amount)}
              onChange={(e) => setEditAmount(e.target.value)}
            />
            <Button size="sm" variant="outline" disabled={busy} onClick={doUpdateAmount}>{t("m.updateAmount")}</Button>
          </span>
        )}
      </div>

      {c.escrow_status === "awaiting" && c.prize_amount && c.prize_amount > 0 && (
        <FundingPanel c={c} busy={busy} setBusy={setBusy} onDone={refresh} />
      )}
      {(c.escrow_status === "refund_pending" || (open && c.escrow_status === "funded" && c.payment_method === "chain" && new Date(c.ends_at).getTime() < Date.now())) && (
        <ChainRefund campaignId={c.id} busy={busy} setBusy={setBusy} onDone={refresh} />
      )}

      {open && !c.tweet_url && (c.escrow_status === "funded" || c.escrow_status === "preauthorized" || c.escrow_status === "charged" || c.payment_method === "manual") && (
        <p className="mt-4 text-sm text-muted-foreground">
          <a
            href={`https://x.com/intent/post?text=${encodeURIComponent(campaignTweet(c, typeof window !== "undefined" ? window.location.origin : ""))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >{t("new.postToX")} ↗</a>
        </p>
      )}

      <section className="mt-8 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t("m.conditions")}</h2>
          <div className="flex gap-2">
            {open && <Button variant="ghost" size="sm" onClick={() => setEditConds((v) => !v)}>{t("m.editConds")}</Button>}
            <Button variant="outline" size="sm" disabled={busy} onClick={runCondCheck}>{t("m.checkConditions")}</Button>
          </div>
        </div>
        {open && editConds && <ConditionEditor c={c} onDone={refresh} />}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="https://x.com/you/status/…"
            value={tweetUrl ?? c.tweet_url ?? ""}
            onChange={(e) => setTweetUrl(e.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={saveTweet} disabled={tweetUrl === null}>{t("m.saveTweet")}</Button>
        </div>
        {(() => {
          const conditions = parseConditions(c.conditions);
          const configured = Object.values(conditions).some((v) => v !== undefined);
          if (!configured) return <p className="mt-4 text-sm text-muted-foreground">{t("cond.none")}</p>;
          if (!condResult) return null;
          return (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{condResult.progress}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${condResult.progress}%` }} />
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {condResult.checks.map((ch) => (
                  <li key={ch.key} className="flex items-center justify-between">
                    <span>
                      {t(`cond.${ch.label}` as Parameters<typeof t>[0])} <span className="text-muted-foreground">≥ {ch.target}</span>
                      {typeof ch.current === "number" && <span className="ml-2 font-mono text-muted-foreground">({ch.current})</span>}
                    </span>
                    <span className={ch.state === "met" ? "text-success" : "text-muted-foreground"}>
                      {ch.state === "met" ? `✓ ${t("cond.met")}` : ch.state === "unmet" ? t("cond.unmet") : t("cond.unknown")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">{entries.length} {t("c.participants")}</h2>
          {open && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => runCheck(entries.filter((e) => e.eligibility_status === "unverified").map((e) => e.id))}>
                {t("m.checkAll")}
              </Button>
              <Button size="sm" disabled={busy || entries.length === 0} onClick={doDraw}>{t("m.draw")}</Button>
            </div>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="mt-6 text-muted-foreground">{t("m.noEntries")}</p>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {entries.map((e) => {
              const meta = e.fetched_meta as { author_name?: string; text?: string; handle_match?: boolean | null } | null;
              const answers = (e.answers as string[]) ?? [];
              return (
                <div key={e.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{e.handle}</span>
                      <EntryBadge status={e.eligibility_status} />
                      <span className="text-xs uppercase text-muted-foreground">{e.platform}</span>
                      {meta?.handle_match === false && <span className="text-xs text-destructive">⚠ {t("m.handleMismatch")}</span>}
                    </div>
                    <a href={e.post_url} target="_blank" rel="noreferrer" className="block truncate text-sm text-primary hover:underline">{e.post_url}</a>
                    {meta && <p className="mt-1 text-sm text-muted-foreground">{meta.author_name}: {meta.text}</p>}
                    {answers.map((a, i) => <p key={i} className="text-sm">• {a}</p>)}
                  </div>
                  {open && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => runCheck([e.id])}>{t("m.check")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(e.id, "eligible")}>{t("m.eligible")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(e.id, "ineligible")}>{t("m.ineligible")}</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {payouts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-semibold">{t("m.payouts")}</h2>
          <div className="mt-4 space-y-3">
            {payouts.map((p) => (
              <PayoutRow key={p.id} p={p} share={c.prize_amount && c.winners_count > 0 ? Number(c.prize_amount) / c.winners_count : null} currency={c.currency} paymentMethod={c.payment_method} onDone={refresh} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
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
