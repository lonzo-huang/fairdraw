/**
 * Tweet/card text generation for the create-campaign flow. Pure functions shared
 * by the page, preview, and tests — no DOM access here.
 */

export type CardGoal = {
  v: number;
  zh: string;
  en: string;
  /** counts people → zh unit 位 instead of 条 */ ppl?: boolean;
};

export type CardData = {
  /** Organiser X handle (no @) for the card and ALT text. */
  host: string;
  amt: number;
  win: number;
  /** Duration in hours. */
  hrs: number;
  /** false when paying online → the prize reads as a gift card. */
  crypto: boolean;
  cur: string;
  prize: string;
  prizeEn: string;
  each: string;
  dur: string;
  durEn: string;
  /** Chip text, e.g. "回复 100 · 曝光 5,000". */
  goals: string;
  goalsZh: string;
  goalsEn: string;
  /** Canonical campaign URL for the QR and reply. */
  url: string;
  short: string;
  kw: string;
};

const fmt = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

export function cardData(o: {
  host: string;
  amt: number;
  win: number;
  hrs: number;
  crypto: boolean;
  currency: string;
  goals: CardGoal[];
  kw: string;
  url: string;
}): CardData {
  const { host, crypto } = o;
  const amt = Math.max(0, o.amt || 0);
  const win = Math.max(1, Math.floor(o.win || 1));
  const hrs = Math.max(1, Math.round(o.hrs || 24));
  const cur = crypto ? o.currency : "USD";
  const prize = crypto ? `${fmt(amt)} ${cur}` : `$${fmt(amt)} 礼品卡`;
  const prizeEn = crypto ? `${fmt(amt)} ${cur}` : `$${fmt(amt)} gift card${win > 1 ? "s" : ""}`;
  const each = crypto ? `${fmt(amt / win)} ${cur}` : `$${fmt(amt / win)}`;
  const dur = hrs < 48 ? `${hrs} 小时` : `${hrs / 24} 天`;
  const durEn = hrs < 48 ? `${hrs} hours` : `${hrs / 24} days`;
  const goals = o.goals.map((g) => `${g.zh} ${g.v.toLocaleString()}`).join(" · ");
  const goalsZh = o.goals
    .map((g) => `${g.v.toLocaleString()} ${g.ppl ? "位" : "条"}${g.zh}`)
    .join("、");
  const goalsEn = o.goals.map((g) => `${g.v.toLocaleString()} ${g.en}`).join(" + ");
  const short = o.url.replace(/^https?:\/\/(www\.)?/, "");
  return {
    host: host.replace(/^@/, ""),
    amt,
    win,
    hrs,
    crypto,
    cur,
    prize,
    prizeEn,
    each,
    dur,
    durEn,
    goals,
    goalsZh,
    goalsEn,
    url: o.url,
    short,
    kw: o.kw.trim(),
  };
}

/** Tweet body templates: 0=简洁 1=热情 2=悬念 3=English. Link deliberately excluded — it goes in the reply. */
export function tweetBody(d: CardData, tone: number, tags: string): string {
  const per = d.win > 1 ? `，每人 ${d.each}` : "";
  const perEn = d.win > 1 ? ` · ${d.each} each` : "";
  const kwZh = d.kw ? `（回复需包含「${d.kw}」）` : "";
  const kwEn = d.kw ? ` (include "${d.kw}")` : "";
  const T = [
    `🎁 回帖赢 ${d.prize}

抽 ${d.win} 位${per}
💬 回复本帖即可参与${kwZh}
🎯 满 ${d.goalsZh}开奖
⏳ ${d.dur}后截止

奖金已托管在 FairDraw，开奖过程公开可验证`,
    `感谢大家一直以来的支持！🙌

这次送出 ${d.prize}，抽 ${d.win} 位朋友${per}。
在下面回复一句话就算参与${kwZh}，满 ${d.goalsZh}就开奖，${d.dur}内有效。

奖金已经提前托管，结果谁都能验证，放心冲 🍀`,
    `有 ${d.win} 个人会在 ${d.dur}后收到 ${d.prize} 👀

条件很简单：回复这条推文${kwZh}。
达到 ${d.goalsZh}，就公开抽奖。

谁会是那个幸运儿？`,
    `🎁 Reply to win ${d.prizeEn}!

${d.win} winner${d.win > 1 ? "s" : ""}${perEn}
💬 Reply to this post to enter${kwEn}
🎯 Draw at ${d.goalsEn}
⏳ Ends in ${d.durEn}

Prize held in escrow on FairDraw · verifiable draw`,
  ];
  const body = T[Math.min(3, Math.max(0, tone))];
  return body + (tags.trim() ? `\n\n${tags.trim()}` : "");
}

export function replyText(d: CardData, tone: number): string {
  return tone === 3 ? `Full rules & verifiable draw 👉 ${d.url}` : `完整规则和开奖验证 👉 ${d.url}`;
}

export function altText(d: CardData, tone: number): string {
  return tone === 3
    ? `Giveaway card by @${d.host}: reply to win ${d.prizeEn}, ${d.win} winner(s). Draw at ${d.goalsEn}, ends in ${d.durEn}. Prize held in escrow on FairDraw. QR code links to ${d.short}.`
    : `@${d.host} 的抽奖卡片：回帖赢 ${d.prize}，抽 ${d.win} 位。满 ${d.goalsZh}开奖，${d.dur}后截止。奖金已托管在 FairDraw，开奖可公开验证。二维码指向 ${d.short}。`;
}

/** X-style weighted length: CJK and wide chars count as 2. */
export function tweetLen(s: string): number {
  return [...s].reduce((a, ch) => a + (/[ᄀ-￿]/.test(ch) ? 2 : 1), 0);
}
