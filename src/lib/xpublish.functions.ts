import { createServerFn } from "@tanstack/react-start";

/**
 * One-click X publishing: requires a FairDraw X developer app with OAuth 2.0
 * (tweet.write, tweet.read, users.read, offline.access) plus encrypted token
 * storage. Until X_CLIENT_ID/X_CLIENT_SECRET/X_TOKEN_KEY are configured the
 * feature reports as unavailable and the UI falls back to copy-and-post.
 */
export const xPublishStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(
    process.env["X_CLIENT_ID"] && process.env["X_CLIENT_SECRET"] && process.env["X_TOKEN_KEY"],
  ),
}));

/** Posts the confirmed tweet + image + ALT and replies with the rules link. */
export const publishCampaignTweet = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      campaignId: string;
      body: string;
      reply: string;
      alt: string;
      imagePngBase64: string;
    }) => {
      if (!d?.campaignId || !d.body?.trim()) throw new Error("Missing campaign or tweet body");
      return {
        campaignId: d.campaignId,
        body: d.body,
        reply: d.reply,
        alt: d.alt,
        imagePngBase64: d.imagePngBase64,
      };
    },
  )
  .handler(async () => {
    throw new Error("X_PUBLISH_NOT_CONFIGURED");
  });
