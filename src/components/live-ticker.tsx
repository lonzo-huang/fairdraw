import { usePublicHub } from "@/hooks/use-public-hub";
import { useI18n } from "@/lib/i18n";
import { isLive, poolFunded, xHandleFromUrl } from "@/lib/campaign-hub";

/** Transparent marquee under the header: real draws, new campaigns, pool leaders, ad slot. */
export function LiveTicker() {
  const { t } = useI18n();
  const { data = [] } = usePublicHub();
  const name = (c: (typeof data)[number]) => { const h = xHandleFromUrl(c.tweet_url); return h ? `@${h}` : c.title; };
  const pool = (c: (typeof data)[number]) => (c.prize_amount ? `${c.prize_amount} ${c.currency}` : c.prize);
  const toItem = (kind: string) => (c: (typeof data)[number]) => ({ kind, handle: name(c), pool: pool(c), sim: !!c.is_simulated });
  const drawn = data.filter((c) => c.status === "drawn").slice(0, 4).map(toItem(t("tick.drawn")));
  const fresh = data.filter((c) => isLive(c, Date.now())).slice(0, 4).map(toItem(t("tick.new")));
  const top = [...data].filter((c) => c.prize_amount && (c.status === "drawn" || poolFunded(c))).sort((a, b) => Number(b.prize_amount) - Number(a.prize_amount))[0];
  const items = [...drawn, ...fresh, ...(top ? [toItem(t("tick.top"))(top)] : [])];
  return (
    <div className="ticker-strip">
      <div className="metrics-track">
        {[0, 1].map((i) => (
          <div key={i} aria-hidden={i === 1} className="flex gap-12">
            {items.map((item, k) => (
              <span key={k} className="flex items-center gap-2 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                <span className="live-dot" />
                {item.kind} · <span className="font-medium">{item.handle}</span> · <em className="font-display not-italic font-bold text-prize">{item.pool}</em>
                {item.sim && <span className="rounded border border-border px-1 py-px text-[9px]">{t("sim.tag")}</span>}
              </span>
            ))}
            <span className="flex items-center gap-2 whitespace-nowrap font-mono text-[10px] text-muted-foreground"><span className="live-dot" />{t("trust.3")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
