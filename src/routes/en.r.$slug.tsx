import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCampaignShare } from "@/lib/campaign-share.functions";
import { resultPageQuery, ResultPage } from "./r.$slug";
import { xHandleFromUrl } from "@/lib/campaign-hub";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/r/$slug")({
  loader: async ({ params, context }) => {
    const share = await getCampaignShare({ data: { slug: params.slug } });
    if (!share?.c) throw notFound();
    await context.queryClient.ensureQueryData(resultPageQuery(params.slug));
    return share;
  },
  head: ({ loaderData }) => {
    const c = loaderData?.c;
    const title = c ? `${c.title} — Draw Result · FairDraw` : "Draw result — Verified with FairDraw";
    const org = c?.tweet_url ? xHandleFromUrl(c.tweet_url) : null;
    const amt = c ? (c.prize_amount !== null && c.prize_amount !== undefined ? `${c.prize_amount} ${c.currency ?? ""}`.trim() : c.prize) : "";
    const description = c
      ? `${org ? `Giveaway by @${org} — ` : ""}${c.winners_count} winners publicly drawn, ${amt} total. The draw is re-computable in your browser; payout proof is published.`
      : "Public, re-computable giveaway result with payout proof.";
    const image = loaderData?.imageUrl;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(c?.is_simulated ? [{ name: "robots", content: "noindex" }] : []),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image?.startsWith("https://") ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }, { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" }] : []),
      ],
      links: i18nLinks(`/r/${loaderData?.c?.slug ?? ""}`, "en"),
      ...(c?.ends_at ? { scripts: [{ type: "application/ld+json", children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Event",
        name: `${c.title} — draw result`,
        startDate: c.ends_at,
        eventStatus: "https://schema.org/EventCompleted",
        eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
        location: { "@type": "VirtualLocation", url: `https://www.fairdraw.win/en/r/${c.slug}` },
        organizer: { "@type": "Organization", name: "FairDraw", url: "https://www.fairdraw.win/" },
        description,
      }) }] } : {}),
    };
  },
  component: ResultPage,
});
