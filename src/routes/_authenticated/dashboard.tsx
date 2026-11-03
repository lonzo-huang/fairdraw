import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ChevronRight, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — FairDraw" },
    { name: "description", content: "Manage your FairDraw campaigns." },
    { property: "og:title", content: "Dashboard — FairDraw" },
    { property: "og:description", content: "Manage your FairDraw campaigns." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const [{ data: campaigns }] = await Promise.all([
        supabase.from("campaigns").select("*").eq("owner_id", uid).order("created_at", { ascending: false }),
      ]);
      const counts = await Promise.all(
        (campaigns ?? []).map(async (c) => (await supabase.rpc("entry_count", { _campaign_id: c.id })).data ?? 0),
      );
      return { campaigns: (campaigns ?? []).map((c, i) => ({ ...c, entries: counts[i] })) };
    },
  });

  if (isLoading || !data) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  const active = data.campaigns.filter((c) => c.status === "open" && Date.parse(c.ends_at) > Date.now()).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">{t("dash.title")}</h1>
          {data.campaigns.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-mono">{data.campaigns.length}</span> {t("dash.total")} · <span className="font-mono text-success">{active}</span> {t("dash.active")}
            </p>
          )}
        </div>
        <Button asChild>
          <Link to="/new">{t("dash.new")}</Link>
        </Button>
      </div>
      {data.campaigns.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-14 text-center">
          <Zap className="size-6 text-prize" />
          <p className="text-muted-foreground">{t("dash.empty")}</p>
          <Button asChild variant="neon"><Link to="/new">{t("dash.emptyCta")}</Link></Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {data.campaigns.map((c) => {
            const rail = c.status === "open" ? "bg-success" : c.status === "drawn" ? "bg-prize" : "bg-border";
            return (
            <Link
              key={c.id}
              to="/manage/$id"
              params={{ id: c.id }}
              className="group flex overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary"
            >
              <span className={`w-1 shrink-0 ${rail}`} />
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-mono text-xl font-semibold text-prize">{c.prize_amount !== null ? `${c.prize_amount} ${c.currency}` : c.prize}</span>
                    <span className="truncate font-display text-base font-semibold">{c.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{c.entries} {t("dash.entries")}{c.target_url ? ` · ${c.clicks} ${t("dash.clicks")}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={c.status} endsAt={c.ends_at} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
