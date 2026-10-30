import { usePublicHub } from "@/hooks/use-public-hub";
import { useI18n } from "@/lib/i18n";
import { xHandleFromUrl } from "@/lib/campaign-hub";

/** Transparent marquee under the header: real draws, new campaigns, pool leaders, ad slot. */
export function LiveTicker() {
  const { t } = useI18n();
  const { data = [] } = usePublicHub();
  const name = (c: (typeof data)[number]) => { const h = xHandleFromUrl(c.tweet_url); return h ? `@${h}` : c.title; };
  const pool = (c: (typeof data)[number]) => (c.prize_amount ? `${c.prize_amount} ${c.currency}` : c.prize);
  const drawn = data.filter((c) => c.status === "drawn").slice(0, 4).map((c) => `${t("tick.drawn")} · ${name(c)} · ${pool(c)}`);
  const fresh = data.filter((c) => c.status !== "drawn").slice(0, 4).map((c) => `${t("tick.new")} · ${name(c)} · ${pool(c)}`);
  const top = [...data].filter((c) => c.prize_amount).sort((a, b) => Number(b.prize_amount) - Number(a.prize_amount))[0];
  const items = [...drawn, ...fresh, ...(top ? [`${t("tick.top")} · ${name(top)} · ${pool(top)}`] : []), t("tick.ad"), t("trust.3")];
  return (
    <div className="ticker-strip">
      <div className="metrics-track">
        {[0, 1].map((i) => (
          <div key={i} aria-hidden={i === 1} className="flex gap-12">
            {items.map((text, k) => <span key={k} className="flex items-center gap-3 whitespace-nowrap font-mono text-[10px] text-muted-foreground"><span className="live-dot" />{text}</span>)}
          </div>
        ))}
      </div>
    </div>
  );
}
