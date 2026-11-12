import { createServerFn } from "@tanstack/react-start";

const X_UPLOAD = "https://upload.twitter.com/1.1/media/upload.json";
const X_TWEET = "https://api.twitter.com/2/tweets";
const X_ME = "https://api.twitter.com/2/users/me";

/** Upload base64-encoded JPEG (pre-resized client-side); set ALT; return media_id_string. */
async function uploadMedia(token: string, b64: string, alt: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("media", new Blob([bytes], { type: "image/jpeg" }), "fairdraw.jpg");
  const r = await fetch(X_UPLOAD, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!r.ok) throw new Error(`X media upload ${r.status}: ${await r.text()}`);
  const { media_id_string } = (await r.json()) as { media_id_string: string };
  if (alt.trim()) {
    await fetch("https://upload.twitter.com/1.1/media/metadata/create.json", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: media_id_string, alt_text: { text: alt.slice(0, 1000) } }),
    });
  }
  return media_id_string;
}

/** Create a tweet (or reply) and return its ID. */
async function postTweet(
  token: string,
  text: string,
  opts: { mediaId?: string; replyTo?: string } = {},
): Promise<string> {
  const body: Record<string, unknown> = { text };
  if (opts.mediaId) body["media"] = { media_ids: [opts.mediaId] };
  if (opts.replyTo) body["reply"] = { in_reply_to_tweet_id: opts.replyTo };
  const r = await fetch(X_TWEET, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`X tweet ${r.status}: ${await r.text()}`);
  const { data } = (await r.json()) as { data: { id: string } };
  return data.id;
}

/**
 * One-click X publishing. Requires X_ACCESS_TOKEN (OAuth 2.0 user access token
 * with tweet.write + users.read scopes) set as a server secret.
 * Full per-user PKCE flow can be added later; this uses the app-owner token.
 */
export const xPublishStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(process.env["X_ACCESS_TOKEN"]),
}));

/** Upload card image, post main tweet, post first reply with campaign link. */
export const publishCampaignTweet = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      campaignId: string;
      body: string;
      reply: string;
      alt: string;
      imageBase64: string;
    }) => {
      if (!d?.campaignId || !d.body?.trim()) throw new Error("Missing campaign or tweet body");
      return {
        campaignId: d.campaignId,
        body: d.body,
        reply: d.reply ?? "",
        alt: d.alt ?? "",
        imageBase64: d.imageBase64 ?? "",
      };
    },
  )
  .handler(async ({ data: d }) => {
    const token = process.env["X_ACCESS_TOKEN"];
    if (!token) throw new Error("X_PUBLISH_NOT_CONFIGURED");

    const mediaId = d.imageBase64
      ? await uploadMedia(token, d.imageBase64, d.alt)
      : undefined;

    const tweetId = await postTweet(token, d.body, mediaId ? { mediaId } : {});

    if (d.reply.trim()) {
      await postTweet(token, d.reply, { replyTo: tweetId });
    }

    const meRes = await fetch(X_ME, { headers: { Authorization: `Bearer ${token}` } });
    const { data: me } = (await meRes.json()) as { data: { username: string } };
    const tweetUrl = `https://x.com/${me.username}/status/${tweetId}`;

    return { tweetId, tweetUrl };
  });
