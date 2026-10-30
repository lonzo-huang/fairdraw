import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
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
  const [min, setMin] = useState(""); const [rate, setRate] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["fee-tiers"] });

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
    </div>
  );
}
