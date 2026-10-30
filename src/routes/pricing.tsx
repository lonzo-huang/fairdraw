import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "手续费 — FairDraw" },
      { name: "description", content: "FairDraw 不限发布次数，按奖池金额收取阶梯手续费。" },
      { property: "og:title", content: "手续费 — FairDraw" },
      { property: "og:description", content: "FairDraw 不限发布次数，按奖池金额收取阶梯手续费。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const { t } = useI18n();
  const { data: tiers = [] } = useFeeTiers();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-center text-4xl font-semibold">{t("fee.title")}</h1>
      <p className="mt-3 text-center text-muted-foreground">{t("fee.sub")}</p>
      <div className="mt-10 overflow-hidden rounded-xl border border-border bg-card">
        {tiers.map((tier, i) => {
          const next = tiers[i + 1];
          return (
            <div key={tier.id} className="flex items-center justify-between border-b border-border px-6 py-5 last:border-0">
              <span className="font-mono text-sm text-muted-foreground">
                {next ? `${tier.min_amount} – ${next.min_amount}` : `≥ ${tier.min_amount}`}
              </span>
              <span className="font-mono text-2xl font-semibold text-success">{tier.rate_percent}%</span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">{t("fee.note")}</p>
      <div className="mt-8 text-center"><Button asChild variant="neon"><Link to="/new">{t("hero.cta")}</Link></Button></div>
    </div>
  );
}
