import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">{t("dash.title")}</h1>
        </div>
        <Button asChild>
          <Link to="/new">{t("dash.new")}</Link>
        </Button>
      </div>
      {data.campaigns.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">{t("dash.empty")}</p>
      ) : (
        <div className="mt-8 grid gap-4">
          {data.campaigns.map((c) => (
            <Link
              key={c.id}
              to="/manage/$id"
              params={{ id: c.id }}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div>
                <p className="font-serif text-xl font-semibold">{c.title}</p>
                <p className="text-sm text-muted-foreground">{c.prize}</p>
              </div>
              <div className="flex items-center gap-4 font-mono text-sm text-muted-foreground">
                <span>{c.entries} {t("dash.entries")}</span>
                {c.target_url && <span>{c.clicks} {t("dash.clicks")}</span>}
                <StatusBadge status={c.status} endsAt={c.ends_at} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
