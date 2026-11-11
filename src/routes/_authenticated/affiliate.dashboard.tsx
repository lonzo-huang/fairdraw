import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { AFF } from "@/lib/affiliate";
import { affiliateDashboard, joinAffiliate, setAffiliateWallet } from "@/lib/affiliate.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowUpRight, Copy, ShieldCheck, Trophy, Users, Wallet, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/affiliate/dashboard")({
  head: () => ({ meta: [{ title: "联盟后台 · FairDraw" }] }),
  component: AffiliateDash,
});

const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
const money = (v: number) => v.toFixed(2);

function AffiliateDash() {
  const { t } = useI18n();
  const dash = useQuery({ queryKey: ["affiliate-dash"], queryFn: () => affiliateDashboard({}) });
  const [tab, setTab] = useState<"refs" | "pay" | "asset">("refs");
  const [wallet, setWallet] = useState("");
  const [walletEdit, setWalletEdit] = useState(false);

  const join = useMutation({
    mutationFn: () => joinAffiliate({}),
    onSuccess: () => dash.refetch(),
  });
  const saveWallet = useMutation({
    mutationFn: (address: string) => setAffiliateWallet({ data: { address } }),
    onSuccess: () => { toast.success(t("affd.walletSaved")); setWalletEdit(false); dash.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const copy = async (v: string, msg: string) => {
    try { await navigator.clipboard.writeText(v); } catch { /* clipboard unavailable */ }
    toast.success(msg);
  };

  if (dash.isPending) return <div className="mx-auto max-w-6xl px-5 py-16 text-sm text-muted-foreground">{t("cy.loading")}</div>;
  const d = dash.data;

  // Not a member yet → instant join.
  if (!d?.referrer) {
    return <div className="mx-auto max-w-md px-5 py-20 text-center">
      <Users className="mx-auto size-10 text-primary" />
      <h1 className="mt-4 text-2xl font-semibold">{t("affd.joinTitle")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("affd.joinSub")}</p>
      <Button size="lg" variant="neon" className="mt-6 w-full" disabled={join.isPending} onClick={() => join.mutate()}>{t("affd.joinBtn")}</Button>
    </div>;
  }

  const k = d.kpis;
  const ref = d.referrer;
  const link = ref.link;
  const maxClick = Math.max(...k.clickDays, 1);
  const funnel = [k.monthClicks, d.referrals.length, d.referrals.filter((x) => x.campaigns > 0).length, k.activeReferrals];

  return <div className="page-affd mx-auto max-w-6xl px-5 pb-20 pt-8 sm:px-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><span className="affd-lvl">◆ {t("affd.lvl")}</span><h1 className="mt-2 text-3xl font-semibold">{t("affd.title")}</h1></div>
    </div>

    {/* referral link */}
    <div className="cyber-panel affd-reflink">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{t("affd.linkLabel", { code: ref.code })}</div>
        <code className="block truncate font-mono text-sm text-prize">{link}</code>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="glass" size="sm" onClick={() => copy(link, t("affd.copied"))}><Copy className="size-3.5" />{t("affd.copyLink")}</Button>
        <Button variant="glass" size="sm" onClick={() => copy(ref.code.toUpperCase(), t("affd.copied"))}>{t("affd.copyCode")}</Button>
        <Button asChild variant="glass" size="sm"><a href={`https://x.com/intent/tweet?text=${encodeURIComponent(d.tweet)}`} target="_blank" rel="noopener noreferrer"><X className="size-3.5" />{t("affd.shareX")}</a></Button>
      </div>
    </div>

    {/* KPIs */}
    <div className="mt-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      <div className="cyber-panel p-4"><div className="text-xs text-muted-foreground">{t("affd.k1")}</div><div className="mt-1.5 font-mono text-3xl font-bold">{k.clicks.toLocaleString()}</div><div className="text-xs text-muted-foreground">{t("affd.k1f", { n: k.monthClicks })}</div></div>
      <div className="cyber-panel p-4"><div className="text-xs text-muted-foreground">{t("affd.k2")}</div><div className="mt-1.5 font-mono text-3xl font-bold">{k.referrals}</div><div className="text-xs text-muted-foreground">{k.clicks ? t("affd.k2f", { r: (k.referrals / k.clicks * 100).toFixed(1) }) : "—"}</div></div>
      <div className="cyber-panel p-4"><div className="text-xs text-muted-foreground">{t("affd.k3")}</div><div className="mt-1.5 font-mono text-3xl font-bold">{k.activeReferrals}</div><div className="text-xs text-muted-foreground">{t("affd.k3f", { n: k.monthCampaigns })}</div></div>
      <div className="cyber-panel border-prize/35 p-4"><div className="text-xs text-muted-foreground">{t("affd.k4")}</div><div className="mt-1.5 font-mono text-3xl font-bold text-prize">{money(k.monthCommission)}</div><div className="text-xs text-muted-foreground">{t("affd.k4f")}</div></div>
    </div>

    {/* stages */}
    <div className="mt-3.5 grid gap-3.5 md:grid-cols-3">
      {([["pending", t("affd.st1"), t("affd.st1f"), "text-muted-foreground"],
        ["confirmed", t("affd.st2"), t("affd.st2f", { d: AFF.settleDay }), "text-success"],
        ["paid", t("affd.st3"), t("affd.st3f"), "text-prize"]] as const).map(([key, label, sub, cls]) => (
        <div key={key} className="cyber-panel p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><i className="size-2 rounded-full bg-current" />{label}</div>
          <div className={`mt-1.5 font-mono text-2xl font-bold ${cls}`}>{money(d.stages[key])}<small className="ml-1 text-xs font-medium text-muted-foreground">USDT</small></div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
      ))}
    </div>

    {/* wallet / verification */}
    <div className={`mt-4 flex flex-wrap items-center gap-3.5 rounded-2xl border px-5 py-4 ${ref.payoutAddress ? "border-success/30 bg-success/5" : "border-prize/30 bg-prize/5"}`}>
      <ShieldCheck className={`size-5 ${ref.payoutAddress ? "text-success" : "text-prize"}`} />
      <div className="min-w-0 flex-1">
        <b className="block text-sm">{ref.payoutAddress ? t("affd.walletSet") : t("affd.walletNeed")}</b>
        <span className="block truncate font-mono text-xs text-muted-foreground">{ref.payoutAddress ? `${ref.payoutAddress.slice(0, 8)}…${ref.payoutAddress.slice(-4)} · BEP20` : t("affd.walletHint")}</span>
      </div>
      {walletEdit ? (
        <div className="flex w-full gap-2 sm:w-auto">
          <input className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 font-mono text-xs outline-none focus:border-primary sm:w-72" placeholder="0x…" value={wallet} onChange={(e) => setWallet(e.target.value)} />
          <Button size="sm" variant="neon" disabled={saveWallet.isPending} onClick={() => saveWallet.mutate(wallet.trim())}>{t("affd.save")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setWalletEdit(false)}>×</Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => { setWallet(ref.payoutAddress ?? ""); setWalletEdit(true); }}>{ref.payoutAddress ? t("affd.manage") : t("affd.bind")}</Button>
      )}
    </div>

    {/* trend + funnel */}
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div className="cyber-panel p-5">
        <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">{t("affd.trend")}</h3><p className="text-xs text-muted-foreground">{t("affd.trendSub")}</p></div></div>
        <div className="flex h-44 items-end gap-1">
          {k.clickDays.map((v, i) => <div key={i} className="affd-bar" style={{ height: `${Math.max(2, (v / maxClick) * 100)}%` }} data-v={`${v} ${t("affd.clicks")}`} />)}
        </div>
      </div>
      <div className="cyber-panel p-5">
        <div className="mb-4"><h3 className="font-semibold">{t("affd.funnel")}</h3><p className="text-xs text-muted-foreground">{t("affd.funnelSub")}</p></div>
        <div className="space-y-3">
          {funnel.map((v, i) => {
            const pct = funnel[0] ? Math.round((v / funnel[0]) * 100) : 0;
            return <div key={i}>
              <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{t(`affd.f${i + 1}`)}</span><b className="font-mono">{v}</b></div>
              <div className="h-6 overflow-hidden rounded-lg bg-white/5"><i className="affd-fu" style={{ width: `${Math.max(4, pct)}%`, opacity: 1 - i * 0.18 }}>{pct}%</i></div>
            </div>;
          })}
        </div>
      </div>
    </div>

    {/* tabs */}
    <div className="cyber-panel mt-4 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h3 className="font-semibold">{t(`affd.tab.${tab}.t`)}</h3><p className="text-xs text-muted-foreground">{t(`affd.tab.${tab}.sub`)}</p></div>
        <div className="flex gap-1 rounded-lg border border-border bg-black/30 p-1">
          {(["refs", "pay", "asset"] as const).map((x) => <button key={x} className={`rounded-md px-3 py-1.5 text-xs ${tab === x ? "bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]" : "text-muted-foreground"}`} onClick={() => setTab(x)} aria-selected={tab === x}>{t(`affd.tab.${x}`)}</button>)}
        </div>
      </div>

      {tab === "refs" && (
        d.referrals.length ? <div className="overflow-x-auto"><table className="affd-tbl">
          <thead><tr><th>{t("affd.th.user")}</th><th>{t("affd.th.bound")}</th><th className="n">{t("affd.th.camps")}</th><th className="n">{t("affd.th.fee")}</th><th className="n">{t("affd.th.cost")}</th><th className="n">{t("affd.th.net")}</th><th className="n">{t("affd.th.you")}</th><th>{t("affd.th.left")}</th></tr></thead>
          <tbody>{d.referrals.map((r) => <tr key={r.id}>
            <td><span className="affd-who"><i>{r.handle.slice(1, 2).toUpperCase()}</i>{r.handle}</span></td>
            <td>{r.boundAt.slice(0, 10)}</td>
            <td className="n">{r.campaigns}</td>
            <td className="n">{money(r.fee)}</td>
            <td className="n text-destructive">{r.cost ? `−${money(r.cost)}` : "0.00"}</td>
            <td className="n">{money(r.net)}</td>
            <td className="n text-prize">{money(r.amount)}</td>
            <td>{r.campaigns === 0 ? <span className="affd-tag wait">{t("affd.noCamps")}</span> : <span className="affd-tag ok">{t("affd.left", { m: r.monthsLeft })}</span>}</td>
          </tr>)}</tbody>
        </table></div> : <p className="py-10 text-center text-sm text-muted-foreground">{t("affd.emptyRefs")}</p>
      )}

      {tab === "pay" && (
        <>
          <div className="affd-payout">
            <div><div className="text-xs text-muted-foreground">{t("affd.pay.pending")}</div><div className="font-mono text-2xl font-bold text-prize">{money(d.stages.confirmed)}<small className="ml-1 text-xs text-muted-foreground">USDT</small></div>
            <div className="text-xs text-muted-foreground">{t("affd.pay.roll", { min: AFF.minPayout })} · {t("affd.pay.inHold", { v: money(d.stages.pending) })}</div></div>
          </div>
          <div className="affd-wallet">{t("affd.pay.addr")} <code>{ref.payoutAddress ? `${ref.payoutAddress.slice(0, 10)}…${ref.payoutAddress.slice(-6)}` : "—"}</code><span className="affd-chain">BEP20</span></div>
          {d.settlements.length ? <div className="overflow-x-auto"><table className="affd-tbl">
            <thead><tr><th>{t("affd.th.month")}</th><th className="n">{t("affd.th.amount")}</th><th>{t("affd.th.status")}</th><th>{t("affd.th.tx")}</th></tr></thead>
            <tbody>{d.settlements.map((s) => <tr key={s.month}>
              <td>{s.month}</td><td className="n">{money(s.amount)} USDT</td><td><span className="affd-tag ok">{t("affd.pay.paid")}</span></td>
              <td className="font-mono text-xs">{s.paidTx ? <a className="text-primary" href={`https://bscscan.com/tx/${s.paidTx}`} target="_blank" rel="noopener noreferrer">{s.paidTx.slice(0, 10)}… ↗</a> : "—"}</td>
            </tr>)}</tbody>
          </table></div> : <p className="py-8 text-center text-sm text-muted-foreground">{t("affd.emptyPay")}</p>}
        </>
      )}

      {tab === "asset" && (
        <div className="max-w-xl">
          <div className="affd-tpl">{d.tweet}</div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t("affd.tplNote")}</span>
            <Button variant="glass" size="sm" onClick={() => copy(d.tweet, t("affd.copied"))}><Copy className="size-3.5" />{t("affd.copyTpl")}</Button>
          </div>
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-prize/25 bg-prize/5 p-3 text-xs text-muted-foreground">
            <Trophy className="size-4 shrink-0 text-prize" /><div dangerouslySetInnerHTML={{ __html: t("affd.tplWarn") }} />
          </div>
        </div>
      )}
    </div>
  </div>;
}
