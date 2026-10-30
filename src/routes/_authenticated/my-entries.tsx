import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/my-entries")({
  head: () => ({ meta: [
    { title: "My entries — FairDraw" },
    { name: "description", content: "Track your FairDraw giveaway entries and check their results." },
    { property: "og:title", content: "My entries — FairDraw" },
    { property: "og:description", content: "Track your FairDraw giveaway entries and check their results." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MyEntries,
});

function MyEntries() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["my-entries"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: entries } = await supabase
        .from("entries")
        .select("id, handle, created_at, campaigns(id, slug, title, prize, status, ends_at)")
        .eq("user_id", u.user!.id)
        .order("created_at", { ascending: false });
      const ids = (entries ?? []).map((e) => e.campaigns?.id).filter(Boolean) as string[];
      const { data: draws } = ids.length ? await supabase.from("draws").select("campaign_id, winners").in("campaign_id", ids) : { data: [] };
      return (entries ?? []).map((e) => {
        const d = draws?.find((x) => x.campaign_id === e.campaigns?.id);
        const won = !!d && (d.winners as { id: string }[]).some((w) => w.id === e.id);
        return { ...e, won };
      });
    },
  });
  if (isLoading) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-semibold">{t("my.title")}</h1>
      {!data?.length ? (
        <p className="mt-10 text-muted-foreground">{t("my.empty")}</p>
      ) : (
        <div className="mt-8 space-y-3">
          {data.map((e) =>
            e.campaigns ? (
              <Link
                key={e.id}
                to={e.campaigns.status === "drawn" ? "/r/$slug" : "/c/$slug"}
                params={{ slug: e.campaigns.slug }}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-primary"
              >
                <div>
                  <p className="font-serif text-lg font-semibold">{e.campaigns.title}</p>
                  <p className="text-sm text-muted-foreground">{e.campaigns.prize}</p>
                </div>
                <div className="flex items-center gap-2">
                  {e.won && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs text-primary-foreground">{t("my.won")}</span>}
                  <StatusBadge status={e.campaigns.status} endsAt={e.campaigns.ends_at} />
                </div>
              </Link>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
