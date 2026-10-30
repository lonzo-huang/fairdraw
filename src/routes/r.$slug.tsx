import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { claimStripePayout } from "@/lib/payment.functions";
import { runDraw, type Candidate } from "@/lib/draw";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/r/$slug")({
  head: () => ({
    meta: [
      { title: "Draw result — Verified with FairDraw" },
      { name: "description", content: "Public, re-computable giveaway result with payout proof." },
      { property: "og:title", content: "Draw result — Verified with FairDraw" },
      { property: "og:description", content: "Public, re-computable giveaway result with payout proof." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const { slug } = Route.useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const [verdict, setVerdict] = useState<null | boolean>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["result", slug],
    queryFn: async () => {
      const { data: c } = await supabase.from("campaigns").select("*").eq("slug", slug).maybeSingle();
      if (!c) return null;
      const [{ data: d }, { data: payouts }] = await Promise.all([
        supabase.from("draws").select("*").eq("campaign_id", c.id).maybeSingle(),
        supabase.from("payouts").select("*").eq("campaign_id", c.id),
      ]);
      return { c, d, payouts: payouts ?? [] };
    },
  });
  const { data: myHandles = [] } = useQuery({
    queryKey: ["my-entry-handles", data?.c?.id, user?.id],
    enabled: !!data?.c?.id && !!user,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("entries")
        .select("handle")
        .eq("campaign_id", data!.c!.id)
        .eq("user_id", user!.id);
      return (rows ?? []).map((r) => r.handle);
    },
  });

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  if (!data) return <p className="p-10 text-center text-muted-foreground">404</p>;
  const { c, d, payouts } = data;
  if (!d)
    return (
      <div className="p-16 text-center">
        <p className="text-muted-foreground">{t("r.notYet")}</p>
        <Button asChild className="mt-4"><Link to="/c/$slug" params={{ slug }}>{c.title}</Link></Button>
      </div>
    );

  const winners = d.winners as Candidate[];
  const candidates = d.candidates as Candidate[];

  async function verify() {
    const r = await runDraw(candidates, new Date(d!.drawn_at).toISOString(), c!.winners_count);
    setVerdict(r.listHash === d!.list_hash && r.seed === d!.seed && JSON.stringify(r.winners) === JSON.stringify(winners));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="ticket p-8 shadow-[var(--shadow-glow)]">
        <div className="flex justify-between font-mono text-xs uppercase tracking-widest opacity-70">
          <span>{t("r.verifiedBy")}</span>
          <span>#{d.list_hash.slice(0, 4).toUpperCase()}</span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold">{c.title}</h1>
        <p className="mt-1 opacity-70">{c.prize}</p>
        <div className="perforation my-6" />
        <p className="font-mono text-xs uppercase opacity-60">{t("r.winners")}</p>
        <ul className="mt-3 space-y-2">
          {winners.map((w, i) => {
            const p = payouts.find((x) => x.winner_handle === w.handle);
            return (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 font-mono">
                <span>{i + 1}. {w.handle}</span>
                <span className="text-xs opacity-70">
                  {p?.status === "paid" ? `✓ ${t("r.paid")}` : t("r.pending")}
                  {p?.proof && (
                    <span className="ml-2 break-all">
                      {/^https?:\/\//.test(p.proof) ? <a href={p.proof} target="_blank" rel="noreferrer" className="underline">proof ↗</a> : p.proof.slice(0, 18) + "…"}
                    </span>
                  )}
                </span>
                {p && p.status !== "paid" && c.payment_method === "stripe" && myHandles.includes(w.handle) && (
                  <StripeClaim payoutId={p.id} onboarded={!!p.stripe_account_id} onDone={refetch} />
                )}
              </li>
            );
          })}
        </ul>
        <div className="perforation my-6" />
        <dl className="space-y-3 font-mono text-xs">
          <Row k={t("r.count")} v={String(candidates.length)} />
          <Row k={t("r.time")} v={new Date(d.drawn_at).toISOString()} />
          <Row k={t("r.hash")} v={d.list_hash} />
          <Row k={t("r.seed")} v={d.seed} />
        </dl>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">{t("r.how")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("r.howText")}</p>
        <Button className="mt-4" onClick={verify}>{t("r.verify")}</Button>
        {verdict !== null && (
          <p className={`mt-3 font-medium ${verdict ? "text-success" : "text-destructive"}`}>{verdict ? t("r.ok") : t("r.bad")}</p>
        )}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("r.count")} ({candidates.length})</summary>
          <ul className="mt-2 max-h-60 overflow-auto font-mono text-xs text-muted-foreground">
            {candidates.map((x) => <li key={x.id}>{x.id}:{x.handle}</li>)}
          </ul>
        </details>
      </div>
    </div>
  );
}

function StripeClaim({ payoutId, onboarded, onDone }: { payoutId: string; onboarded: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const claim = useServerFn(claimStripePayout);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await claim({ data: { payoutId, origin: window.location.origin } });
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <span>
      {onboarded && <span className="mr-2 text-xs opacity-70">{t("r.claimedInfo")}</span>}
      <Button size="sm" variant="secondary" disabled={busy} onClick={run}>
        {onboarded ? t("r.claimAgain") : t("r.claim")}
      </Button>
    </span>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="uppercase opacity-60">{k}</dt>
      <dd className="break-all">{v}</dd>
    </div>
  );
}
