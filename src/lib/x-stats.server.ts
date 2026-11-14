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
  bookmarks: number | null;
  views: number | null;
  /** Author's follower count — lets clients diff snapshots for new-follower deltas. */
  followers: number | null;
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
    `https://api.x.com/2/tweets/${id}?tweet.fields=public_metrics,text&expansions=author_id&user.fields=verified,verified_type,public_metrics`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as {
    data?: { text?: string; public_metrics?: Record<string, number> };
    includes?: { users?: { username?: string; name?: string; verified?: boolean; verified_type?: string; public_metrics?: Record<string, number> }[] };
  };
  const m = j.data?.public_metrics;
  if (!j.data || !m) return null;
  return {
    likes: num(m["like_count"]),
    replies: num(m["reply_count"]),
    reposts: num(m["retweet_count"]),
    quotes: num(m["quote_count"]),
    bookmarks: num(m["bookmark_count"]),
    views: num(m["impression_count"]),
    followers: num(j.includes?.users?.[0]?.public_metrics?.["followers_count"]),
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
    bookmarks: null,
    views: null,
    followers: num(j.user?.["followers_count"]),
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

/**
 * Definitive "post is gone" check: X's oEmbed endpoint answers 404 for deleted
 * and protected posts — unlike stats sources which fail ambiguously.
 * true = gone, false = exists, null = cannot tell (rate limit, network).
 */
export async function tweetDeleted(url: string): Promise<boolean | null> {
  const res = await fetch(
    `https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url)}`,
    { headers: { "User-Agent": "FairDrawBot/1.0" } },
  );
  if (res.status === 404) return true;
  if (res.ok) return false;
  return null;
}

/** Probes a small batch of URLs through oEmbed; only definitive 404s are marked gone. */
async function probeOembed(urls: string[], gone: Map<string, boolean>, batch = 8) {
  for (let i = 0; i < urls.length; i += batch) {
    await Promise.all(
      urls.slice(i, i + batch).map(async (u) => {
        try {
          if ((await tweetDeleted(u)) === true) gone.set(u, true);
        } catch {
          /* unreadable → treated as existing, same as single-probe callers */
        }
      }),
    );
  }
}

/**
 * Deletion probe for many tweets — one Worker subrequest per 100 posts via
 * the official API's multi-id lookup when X_BEARER_TOKEN is configured
 * (absent ids in `data` are deleted/protected), otherwise parallel oEmbed
 * probes in batches of 8. Returns post URL → true only when definitively
 * gone; every unreadable post keeps its place in the draw.
 */
export async function postsDeleted(urls: string[]): Promise<Map<string, boolean>> {
  const gone = new Map<string, boolean>();
  const byId = new Map<string, string>();
  for (const u of urls) {
    const id = tweetId(u);
    if (id) byId.set(id, u);
  }
  const token = process.env["X_BEARER_TOKEN"];
  if (!token || byId.size === 0) {
    await probeOembed([...byId.values()], gone);
    return gone;
  }
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const res = await fetch(`https://api.x.com/2/tweets?ids=${chunk.join(",")}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`x-api ${res.status}`);
      const j = (await res.json()) as { data?: { id: string }[] };
      const found = new Set((j.data ?? []).map((d) => d.id));
      for (const id of chunk) {
        if (!found.has(id)) gone.set(byId.get(id)!, true);
      }
    } catch {
      // Lookup unavailable — fall back to oEmbed for this chunk only.
      await probeOembed(chunk.map((id) => byId.get(id)!), gone);
    }
  }
  return gone;
}
