import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
import { adminAffiliatePayouts, markCommissionsPaid } from "@/lib/affiliate.functions";
import { AFF } from "@/lib/affiliate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "后台设置 — FairDraw" },
    { name: "description", content: "管理 FairDraw 阶梯手续费。" },
    { property: "og:title", content: "后台设置 — FairDraw" },
    { property: "og:description", content: "管理 FairDraw 阶梯手续费。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Admin,
});

function Admin() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: isAdmin, isLoading } = useQuery({ queryKey: ["is-admin"], queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user!.id).eq("role", "admin").maybeSingle();
    return !!data;
  } });
  const { data: tiers = [] } = useFeeTiers();
  const payouts = useQuery({ queryKey: ["admin-aff-payouts"], queryFn: () => adminAffiliatePayouts({}), enabled: !!isAdmin });
  const [min, setMin] = useState(""); const [rate, setRate] = useState("");
  const [txMap, setTxMap] = useState<Record<string, string>>({});
  const [payingId, setPayingId] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fee-tiers"] });

  async function markPaid(referrerId: string, ids: string[]) {
    const tx = (txMap[referrerId] ?? "").trim();
    if (!tx) { toast.error("Missing tx hash"); return; }
    setPayingId(referrerId);
    try {
      await markCommissionsPaid({ data: { ids, tx } });
      toast.success("Marked paid");
      qc.invalidateQueries({ queryKey: ["admin-aff-payouts"] });
    } catch (e) { toast.error((e as Error).message); }
    setPayingId(null);
  }

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  if (!isAdmin) return <p className="p-10 text-center text-muted-foreground">{t("admin.denied")}</p>;

  async function update(id: string, field: "min_amount" | "rate_percent", value: string) {
    const { error } = await supabase.from("fee_tiers").update(field === "min_amount" ? { min_amount: Number(value) } : { rate_percent: Number(value) }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(t("admin.saved")); refresh(); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("fee_tiers").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  async function add() {
    if (min === "" || rate === "") return;
    const { error } = await supabase.from("fee_tiers").insert({ min_amount: Number(min), rate_percent: Number(rate) });
    if (error) toast.error(error.message); else { setMin(""); setRate(""); refresh(); }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold">{t("admin.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("admin.sub")}</p>
      <div className="mt-8 space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 text-xs text-muted-foreground"><span>{t("admin.min")}</span><span>{t("admin.rate")}</span><span /></div>
        {tiers.map((tier) => (
          <div key={tier.id} className="grid grid-cols-[1fr_1fr_auto] gap-3">
            <Input type="number" min={0} defaultValue={tier.min_amount} onBlur={(e) => e.target.value !== String(tier.min_amount) && update(tier.id, "min_amount", e.target.value)} />
            <Input type="number" min={0} max={100} step="0.1" defaultValue={tier.rate_percent} onBlur={(e) => e.target.value !== String(tier.rate_percent) && update(tier.id, "rate_percent", e.target.value)} />
            <Button variant="ghost" onClick={() => remove(tier.id)}>{t("admin.delete")}</Button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 border-t border-border pt-3">
          <Input type="number" min={0} placeholder="1000" value={min} onChange={(e) => setMin(e.target.value)} />
          <Input type="number" min={0} max={100} step="0.1" placeholder="5" value={rate} onChange={(e) => setRate(e.target.value)} />
          <Button onClick={add}>{t("admin.add")}</Button>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-semibold">{t("admin.aff.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("admin.aff.sub", { min: AFF.minPayout })}</p>
      <div className="mt-4 space-y-3">
        {(payouts.data?.payouts ?? []).length === 0 && !payouts.isPending && <p className="text-sm text-muted-foreground">{t("admin.aff.none")}</p>}
        {(payouts.data?.payouts ?? []).map((p) => (
          <div key={p.referrerId} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-mono text-sm">{p.code}{p.handle ? ` · @${p.handle}` : ""}</div>
              <div className="font-mono text-lg font-bold text-prize">{p.amount.toFixed(2)} USDT</div>
            </div>
            <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{p.address || t("admin.aff.noAddr")}</div>
            <div className="mt-3 flex gap-2">
              <Input className="font-mono text-xs" placeholder="0x… tx hash" value={txMap[p.referrerId] ?? ""} onChange={(e) => setTxMap((m) => ({ ...m, [p.referrerId]: e.target.value }))} />
              <Button variant="neon" disabled={!p.address || payingId === p.referrerId} onClick={() => markPaid(p.referrerId, p.ids)}>{t("admin.aff.markPaid")}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
