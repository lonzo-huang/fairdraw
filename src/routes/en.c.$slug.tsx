import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCampaignShare } from "@/lib/campaign-share.functions";
import { campaignPageQuery, CampaignPage } from "./c.$slug";
import { conditionSummary, prizeSummary } from "@/lib/campaign-share";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/c/$slug")({
  loader: async ({ params, context }) => {
    const share = await getCampaignShare({ data: { slug: params.slug } });
    if (!share?.c) throw notFound();
    await context.queryClient.ensureQueryData(campaignPageQuery(params.slug));
    return share;
  },
  head: ({ loaderData }) => {
    const c = loaderData?.c;
    const title = c ? `${c.title} — FairDraw` : "Giveaway — FairDraw";
    // prize/condition summaries follow the campaign's own share language.
    const description = c ? `${prizeSummary(c)}. ${conditionSummary(c)}` : "Enter this verifiable giveaway on FairDraw.";
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
      links: i18nLinks(`/c/${loaderData?.c?.slug ?? ""}`, "en"),
    };
  },
  component: CampaignPage,
});
