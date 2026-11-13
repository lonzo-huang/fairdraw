import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { publicArchiveQuery } from "@/lib/hub-queries";
import { i18nLinks } from "@/lib/seo";
import { useI18n } from "@/lib/i18n";
import { xHandleFromUrl, type HubCampaign } from "@/lib/campaign-hub";

export const Route = createFileRoute("/archive")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicArchiveQuery),
  head: ({ loaderData }) => ({
    meta: [
      { title: "活动档案 — FairDraw" },
      { name: "description", content: "FairDraw 历史活动档案：全部已开奖、已取消与到期结束的公开记录。" },
      // An archive with zero historical rows is thin content — keep it
      // unindexed until real campaigns finish and fill the page.
      ...(((loaderData ?? []) as { status: string; ends_at: string }[]).some(
        (c) => c.status === "drawn" || c.status === "cancelled" || Date.parse(c.ends_at) <= Date.now(),
      ) ? [] : [{ name: "robots", content: "noindex" }]),
      { property: "og:title", content: "活动档案 — FairDraw" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/archive"),
  }),
  component: ArchivePage,
});

type State = "drawn" | "ended" | "cancelled";
const badgeCls: Record<State, string> = {
  drawn: "border-prize/40 text-prize",
  ended: "border-border text-muted-foreground",
  cancelled: "border-border text-muted-foreground/60",
};

export function ArchivePage() {
  const { t, lp } = useI18n();
  const campaigns = useSuspenseQuery(publicArchiveQuery);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, []);
  const rows = (campaigns.data ?? [])
    .flatMap((c: HubCampaign) => {
      const state: State | null =
        c.status === "drawn" ? "drawn"
        : c.status === "cancelled" ? "cancelled"
        : c.status === "open" && now > 0 && Date.parse(c.ends_at) <= now ? "ended"
        : null;
      return state ? [{ c, state }] : [];
    })
    .sort((a, b) => Date.parse(b.c.ends_at) - Date.parse(a.c.ends_at));
  const pending = now === 0;
  const error = campaigns.isError;

  return <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
    <Button asChild variant="link" className="mb-5 px-0"><Link to={lp("/") as never}><ArrowLeft />{t("archive.back")}</Link></Button>
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-xs text-prize">FAIRDRAW / ARCHIVE</p><h1 className="mt-3 flex items-center gap-3 text-3xl font-semibold"><Archive className="size-7 text-prize" />{t("archive.title")}</h1></div><span className="font-mono text-xs text-muted-foreground">{rows.length} {t("archive.count")}</span></div>
    <p className="mt-5 border-l-2 border-prize pl-3 text-xs leading-6 text-muted-foreground">{t("archive.sub")}</p>
    {rows.length > 0 && <div className="mt-6 overflow-x-auto"><table className="ranking-table w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th>{t("archive.col.date")}</th><th>{t("archive.col.campaign")}</th><th>{t("archive.col.host")}</th><th className="text-right">{t("archive.col.prize")}</th><th className="text-right">{t("archive.col.status")}</th><th className="text-right">{t("archive.col.result")}</th></tr></thead><tbody>{rows.map(({ c, state }) => <tr key={c.id} className="border-b border-border/50">
      <td className="whitespace-nowrap font-mono text-xs text-muted-foreground">{c.ends_at.slice(0, 10)}</td>
      <td><Link to={lp(state === "drawn" ? `/r/${c.slug}` : `/c/${c.slug}`) as never} className="group flex items-center gap-2"><span className="max-w-70 truncate font-medium group-hover:text-primary">{c.title}</span></Link></td>
      <td className="font-mono text-xs text-muted-foreground">{xHandleFromUrl(c.tweet_url) ? `@${xHandleFromUrl(c.tweet_url)}` : "—"}</td>
      <td className="text-right font-mono text-muted-foreground">{c.prize_amount !== null ? `${c.prize_amount} ${c.currency}` : c.prize || "—"}</td>
      <td className="text-right"><span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] ${badgeCls[state]}`}>{t(`archive.st.${state}`)}</span></td>
      <td className="text-right"><Button asChild variant="ghost" size="icon"><Link to={lp(state === "drawn" ? `/r/${c.slug}` : `/c/${c.slug}`) as never} title={t(state === "drawn" ? "archive.verify" : "archive.view")}><ArrowUpRight className="size-4" /></Link></Button></td>
    </tr>)}</tbody></table></div>}
    {!rows.length && <p className="py-16 text-center text-sm text-muted-foreground">{t(error ? "cy.loadError" : pending ? "cy.loading" : "archive.empty")}</p>}
  </section>;
}
