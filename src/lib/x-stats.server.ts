/**
 * Server-only: fetches public X (Twitter) post statistics.
 *
 * Two sources, tried in order:
 *  1. Official X API v2 — requires X_BEARER_TOKEN (paid/basic tier). Most reliable.
 *  2. Public syndication endpoint used by x.com's own embed widgets — free, no key,
 *     but unofficial and can break or rate-limit; unreadable posts return null.
 */

export type TweetStats = {
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  views: number | null;
  text: string | null;
  author_handle: string | null;
  author_name: string | null;
  /** X blue-verified badge on the author; null when the source cannot tell. */
  author_verified: boolean | null;
  source: "x-api" | "x-syndication" | "x-oembed";
};

/** Extracts the numeric status id from a tweet URL. */
export function tweetId(url: string): string | null {
  const m = /(?:x|twitter)\.com\/[^/]+\/status(?:es)?\/(\d+)/i.exec(url ?? "");
  return m?.[1] ?? null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function fromXApi(id: string): Promise<TweetStats | null> {
  const token = process.env["X_BEARER_TOKEN"];
  if (!token) return null;
  const res = await fetch(
    `https://api.x.com/2/tweets/${id}?tweet.fields=public_metrics,text&expansions=author_id&user.fields=verified,verified_type`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as {
    data?: { text?: string; public_metrics?: Record<string, number> };
    includes?: { users?: { username?: string; name?: string; verified?: boolean; verified_type?: string }[] };
  };
  const m = j.data?.public_metrics;
  if (!j.data || !m) return null;
  return {
    likes: num(m["like_count"]),
    replies: num(m["reply_count"]),
    reposts: num(m["retweet_count"]),
    quotes: num(m["quote_count"]),
    views: num(m["impression_count"]),
    text: j.data.text ?? null,
    author_handle: j.includes?.users?.[0]?.username ?? null,
    author_name: j.includes?.users?.[0]?.name ?? null,
    author_verified:
      j.includes?.users?.[0]?.verified === true || j.includes?.users?.[0]?.verified_type === "blue"
        ? true
        : j.includes?.users?.[0] ? false : null,
    source: "x-api",
  };
}

/**
 * The widget endpoint requires a token derived from the tweet id
 * (same formula x.com's embed loader computes). Without it the CDN
 * returns an empty {} object instead of stats.
 */
function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

/** Free fallback: the same JSON endpoint x.com's embedded-tweet widgets call. */
async function fromSyndication(id: string): Promise<TweetStats | null> {
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${syndicationToken(id)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FairDrawBot/1.0)", Accept: "application/json" },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, unknown> & { user?: Record<string, unknown> };
  const likes = num(j["favorite_count"]) ?? num(j["like_count"]);
  const replies = num(j["conversation_count"]) ?? num(j["reply_count"]);
  const reposts = num(j["retweet_count"]) ?? num(j["repost_count"]);
  if (likes === null && replies === null && reposts === null) return null;
  return {
    likes,
    replies,
    reposts,
    quotes: num(j["quote_count"]),
    views: null,
    text: typeof j["text"] === "string" ? j["text"] : null,
    author_handle: typeof j.user?.["screen_name"] === "string" ? j.user["screen_name"] : null,
    author_name: typeof j.user?.["name"] === "string" ? j.user["name"] : null,
    author_verified: typeof j.user?.["is_blue_verified"] === "boolean" ? j.user["is_blue_verified"] : null,
    source: "x-syndication",
  };
}

/**
 * Best-effort public stats for an X post URL. Returns null when the post
 * cannot be read (deleted, protected, or sources down) — callers must treat
 * null as "unknown", never as zero.
 */
export async function fetchTweetStats(url: string): Promise<TweetStats | null> {
  const id = tweetId(url);
  if (!id) return null;
  try {
    const api = await fromXApi(id);
    if (api) return api;
  } catch {
    /* fall through to syndication */
  }
  try {
    return await fromSyndication(id);
  } catch {
    return null;
  }
}
