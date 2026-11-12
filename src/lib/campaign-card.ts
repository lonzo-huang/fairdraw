/**
 * Campaign share card: canvas-rendered PNG in two sizes (wide 1200×675, square
 * 1080×1080) and three themes, with an embedded QR (error-correction Q + center
 * brand mark) pointing at the real campaign URL. Browser-only by design.
 */
import QRCode from "qrcode";
import type { CardData } from "@/lib/campaign-texts";

export type CardSize = "wide" | "square";
export type CardTheme = "gold" | "neon" | "light";
export const CARD_SIZES: Record<CardSize, { w: number; h: number }> = {
  wide: { w: 1200, h: 675 },
  square: { w: 1080, h: 1080 },
};

type Theme = {
  bg: [string, string];
  glow: string;
  glow2: string;
  ink: string;
  sub: string;
  acc: [string, string];
  chip: string;
  chipLine: string;
  trust: string;
  stub: string;
  stubLine: [string, string];
  mono: string;
  grid: string;
};
export const CARD_THEMES: Record<CardTheme, Theme> = {
  gold: {
    bg: ["#0a0f1d", "#111a2e"],
    glow: "rgba(245,184,61,.32)",
    glow2: "rgba(124,92,255,.22)",
    ink: "#f2f4f8",
    sub: "#9aa4b8",
    acc: ["#fff1c9", "#f5b83d"],
    chip: "rgba(255,255,255,.06)",
    chipLine: "rgba(255,255,255,.12)",
    trust: "#34d399",
    stub: "rgba(255,255,255,.04)",
    stubLine: ["#ffd98a", "#7c5cff"],
    mono: "#ffd98a",
    grid: "rgba(255,255,255,.035)",
  },
  neon: {
    bg: ["#12082b", "#0b1030"],
    glow: "rgba(255,79,139,.34)",
    glow2: "rgba(47,139,255,.3)",
    ink: "#ffffff",
    sub: "#b8b2d9",
    acc: ["#7df9ff", "#ff4f8b"],
    chip: "rgba(255,255,255,.07)",
    chipLine: "rgba(255,255,255,.14)",
    trust: "#7df9ff",
    stub: "rgba(255,255,255,.05)",
    stubLine: ["#7df9ff", "#ff4f8b"],
    mono: "#7df9ff",
    grid: "rgba(255,255,255,.04)",
  },
  light: {
    bg: ["#fff8ec", "#ffeedd"],
    glow: "rgba(255,138,61,.28)",
    glow2: "rgba(124,92,255,.14)",
    ink: "#1a1410",
    sub: "#6b5f55",
    acc: ["#ff9d3d", "#e0442b"],
    chip: "rgba(26,20,16,.05)",
    chipLine: "rgba(26,20,16,.12)",
    trust: "#0f9f6e",
    stub: "rgba(255,255,255,.7)",
    stubLine: ["#ff9d3d", "#e0442b"],
    mono: "#c2410c",
    grid: "rgba(26,20,16,.05)",
  },
};

const ICON = {
  reply: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
  target:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
} as const;
const F_NUM = '"Noto Sans SC","IBM Plex Sans",system-ui,sans-serif';
const F_SANS = '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const F_MONO = 'ui-monospace,"SF Mono",Menlo,monospace';

type Ctx = CanvasRenderingContext2D;
function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function grad(c: Ctx, x0: number, y0: number, x1: number, y1: number, cols: string[]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
  return g;
}
function fitFont(
  c: Ctx,
  text: string,
  weight: number,
  family: string,
  maxW: number,
  start: number,
  min: number,
) {
  let s = start;
  do {
    c.font = `${weight} ${s}px ${family}`;
    if (c.measureText(text).width <= maxW) return s;
    s -= 2;
  } while (s > min);
  return min;
}
function icon(
  c: Ctx,
  name: keyof typeof ICON | "shield",
  x: number,
  y: number,
  s: number,
  color: string,
) {
  c.save();
  c.translate(x, y);
  c.scale(s / 24, s / 24);
  c.lineWidth = 2.2;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = color;
  if (name === "shield") {
    c.stroke(new Path2D("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"));
    c.stroke(new Path2D("M9 12l2 2 4-4"));
  } else c.stroke(new Path2D(ICON[name]));
  c.restore();
}

function background(c: Ctx, W: number, H: number, T: Theme) {
  c.fillStyle = grad(c, 0, 0, W, H, T.bg);
  c.fillRect(0, 0, W, H);
  c.strokeStyle = T.grid;
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, H);
    c.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  let g = c.createRadialGradient(W * 0.32, H * 0.2, 0, W * 0.32, H * 0.2, W * 0.55);
  g.addColorStop(0, T.glow);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  g = c.createRadialGradient(W * 0.95, H * 0.95, 0, W * 0.95, H * 0.95, W * 0.5);
  g.addColorStop(0, T.glow2);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

/** QR code with quiet-zone-free dark modules + center FairDraw mark, level Q. */
function drawQR(c: Ctx, url: string, x: number, y: number, size: number, T: Theme) {
  c.fillStyle = "#fff";
  rr(c, x, y, size, size, 18);
  c.fill();
  try {
    const q = QRCode.create(url, { errorCorrectionLevel: "Q" });
    const n = q.modules.size,
      pad = 16,
      cell = (size - pad * 2) / n;
    c.fillStyle = "#0b1020";
    for (let r = 0; r < n; r++)
      for (let col = 0; col < n; col++)
        if (q.modules.get(r, col))
          c.fillRect(
            Math.floor(x + pad + col * cell),
            Math.floor(y + pad + r * cell),
            Math.ceil(cell),
            Math.ceil(cell),
          );
  } catch {
    c.fillStyle = "#999";
    c.font = `500 16px ${F_SANS}`;
    c.textAlign = "center";
    c.fillText("QR", x + size / 2, y + size / 2);
    c.textAlign = "left";
    return;
  }
  const b = size * 0.18,
    bx = x + size / 2 - b / 2,
    by = y + size / 2 - b / 2;
  c.fillStyle = "#fff";
  rr(c, bx - 4, by - 4, b + 8, b + 8, 10);
  c.fill();
  c.fillStyle = grad(c, bx, by, bx + b, by + b, ["#ffd98a", "#f5b83d", "#ff8a3d"]);
  rr(c, bx, by, b, b, 8);
  c.fill();
  c.fillStyle = "#2a1600";
  c.font = `900 ${b * 0.55}px ${F_SANS}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("✦", bx + b / 2, by + b / 2 + 1);
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  void T;
}

function hostRow(
  c: Ctx,
  d: CardData,
  avatar: HTMLImageElement | null,
  x: number,
  y: number,
  T: Theme,
) {
  const r = 26;
  c.fillStyle = grad(c, x, y - r, x + 2 * r, y + r, ["#5aa0ff", "#173a8a"]);
  c.beginPath();
  c.arc(x + r, y, r, 0, Math.PI * 2);
  c.fill();
  if (avatar) {
    c.save();
    c.beginPath();
    c.arc(x + r, y, r, 0, Math.PI * 2);
    c.clip();
    c.drawImage(avatar, x, y - r, 2 * r, 2 * r);
    c.restore();
  } else {
    c.fillStyle = "#fff";
    c.font = `800 18px ${F_NUM}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(d.host.slice(0, 2).toUpperCase(), x + r, y + 1);
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
  }
  c.fillStyle = T.ink;
  c.font = `700 26px ${F_NUM}`;
  c.fillText("@" + d.host, x + r * 2 + 16, y - 12);
  c.fillStyle = T.sub;
  c.font = `500 18px ${F_SANS}`;
  c.fillText("发起的抽奖活动", x + r * 2 + 16, y + 16);
}
function amountBlock(
  c: Ctx,
  d: CardData,
  x: number,
  y: number,
  maxW: number,
  T: Theme,
  big: number,
) {
  c.fillStyle = T.ink;
  c.font = `900 ${big * 0.38}px ${F_SANS}`;
  c.fillText("回帖赢", x, y);
  const amtFmt = d.amt.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const num = d.crypto ? amtFmt : `$${amtFmt}`;
  const unit = d.crypto ? d.cur : "礼品卡";
  c.font = `800 ${big * 0.3}px ${F_SANS}`;
  const uw = c.measureText(unit).width;
  const fs = fitFont(c, num, 800, F_NUM, maxW - uw - 20, big, 48);
  c.font = `800 ${fs}px ${F_NUM}`;
  const nw = c.measureText(num).width,
    ny = y + fs * 0.98;
  c.fillStyle = grad(c, 0, ny - fs * 0.8, 0, ny, T.acc);
  c.fillText(num, x - 4, ny);
  c.fillStyle = T.ink;
  c.font = `800 ${Math.min(big * 0.3, fs * 0.32)}px ${F_SANS}`;
  c.fillText(unit, x + nw + 12, ny);
  c.fillStyle = T.sub;
  c.font = `500 ${big * 0.19}px ${F_SANS}`;
  c.fillText(
    `${d.win} 位幸运用户${d.win > 1 ? ` · 每人 ${d.each}${d.crypto ? "" : " 礼品卡"}` : ""}`,
    x,
    ny + big * 0.36,
  );
  return ny + big * 0.36;
}
function chips(c: Ctx, d: CardData, x: number, y: number, maxW: number, T: Theme, fs: number) {
  const items: [keyof typeof ICON, string][] = [
    ["reply", "回复本帖即可参与"],
    ["target", `目标：${d.goals}`],
    ["clock", `${d.dur}后截止`],
  ];
  let cx = x,
    cy = y;
  const h = fs * 2.1,
    gap = 10;
  for (const [ic, text] of items) {
    c.font = `500 ${fs}px ${F_SANS}`;
    const w = c.measureText(text).width + fs * 2.9;
    if (cx + w > x + maxW) {
      cx = x;
      cy += h + gap;
    }
    c.fillStyle = T.chip;
    rr(c, cx, cy, w, h, h / 2);
    c.fill();
    c.strokeStyle = T.chipLine;
    c.lineWidth = 1.5;
    c.stroke();
    icon(c, ic, cx + fs * 0.75, cy + (h - fs * 1.15) / 2, fs * 1.15, T.acc[1]);
    c.fillStyle = T.ink;
    c.textBaseline = "middle";
    c.fillText(text, cx + fs * 2.2, cy + h / 2 + 1);
    c.textBaseline = "alphabetic";
    cx += w + gap;
  }
  return cy + h;
}
function trustRow(c: Ctx, x: number, y: number, T: Theme, fs: number) {
  icon(c, "shield", x, y - fs * 0.95, fs * 1.25, T.trust);
  c.fillStyle = T.trust;
  c.font = `700 ${fs}px ${F_SANS}`;
  c.fillText("奖金已托管 · 开奖可公开验证", x + fs * 1.7, y);
}
function brand(c: Ctx, x: number, y: number, T: Theme, fs: number) {
  c.fillStyle = grad(c, x, y - fs, x + fs * 1.3, y + fs * 0.3, ["#ffd98a", "#ff8a3d"]);
  rr(c, x, y - fs * 1.05, fs * 1.35, fs * 1.35, fs * 0.35);
  c.fill();
  c.fillStyle = "#2a1600";
  c.font = `900 ${fs * 0.8}px ${F_SANS}`;
  c.textAlign = "center";
  c.fillText("✦", x + fs * 0.675, y - fs * 0.12);
  c.textAlign = "left";
  c.font = `800 ${fs}px ${F_NUM}`;
  c.fillStyle = T.ink;
  c.fillText("Fair", x + fs * 1.65, y);
  const w = c.measureText("Fair").width;
  c.fillStyle = T.acc[1];
  c.fillText("Draw", x + fs * 1.65 + w, y);
}
function stub(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  T: Theme,
  d: CardData,
  qr: number,
) {
  c.fillStyle = T.stub;
  rr(c, x, y, w, h, 28);
  c.fill();
  c.strokeStyle = grad(c, x, y, x + w, y + h, T.stubLine);
  c.lineWidth = 2.5;
  rr(c, x, y, w, h, 28);
  c.stroke();
  const blockH = qr + 150,
    qx = x + (w - qr) / 2,
    qy = y + (h - blockH) / 2;
  drawQR(c, d.url, qx, qy, qr, T);
  c.textAlign = "center";
  c.fillStyle = T.ink;
  c.font = `700 20px ${F_SANS}`;
  c.fillText("扫码查看规则与开奖验证", x + w / 2, qy + qr + 44);
  c.fillStyle = T.mono;
  c.font = `600 ${fitFont(c, d.short, 600, F_MONO, w - 40, 19, 12)}px ${F_MONO}`;
  c.fillText(d.short, x + w / 2, qy + qr + 76);
  c.fillStyle = T.sub;
  c.font = `500 16px ${F_SANS}`;
  c.fillText("参与只需在 X 上回复本帖", x + w / 2, qy + qr + 130);
  c.textAlign = "left";
}

async function loadAvatar(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** Render the card onto the given canvas. Awaits fonts and the avatar image. */
export async function renderCampaignCard(
  canvas: HTMLCanvasElement,
  d: CardData,
  size: CardSize,
  theme: CardTheme,
  opts: { avatarUrl?: string | null } = {},
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const T = CARD_THEMES[theme];
  const [avatar] = await Promise.all([
    loadAvatar(opts.avatarUrl ?? null),
    document.fonts ? document.fonts.ready.catch(() => ({}) as FontFaceSet) : Promise.resolve(),
  ]);
  if (size === "wide") {
    const { w: W, h: H } = CARD_SIZES.wide;
    canvas.width = W;
    canvas.height = H;
    background(ctx, W, H, T);
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = T.chipLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(812, 40);
    ctx.lineTo(812, H - 40);
    ctx.stroke();
    ctx.setLineDash([]);
    hostRow(ctx, d, avatar, 64, 96, T);
    const yb = amountBlock(ctx, d, 64, 212, 700, T, 150);
    chips(ctx, d, 64, yb + 34, 700, T, 22);
    brand(ctx, 64, H - 56, T, 26);
    trustRow(ctx, 270, H - 58, T, 22);
    stub(ctx, 852, 56, 288, H - 112, T, d, 240);
  } else {
    const { w: W, h: H } = CARD_SIZES.square;
    canvas.width = W;
    canvas.height = H;
    background(ctx, W, H, T);
    hostRow(ctx, d, avatar, 72, 108, T);
    const yb = amountBlock(ctx, d, 72, 250, 936, T, 180);
    chips(ctx, d, 72, yb + 42, 936, T, 26);
    ctx.setLineDash([12, 12]);
    ctx.strokeStyle = T.chipLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(56, H - 330);
    ctx.lineTo(W - 56, H - 330);
    ctx.stroke();
    ctx.setLineDash([]);
    brand(ctx, 72, H - 210, T, 34);
    trustRow(ctx, 72, H - 140, T, 26);
    ctx.fillStyle = T.sub;
    ctx.font = `500 22px ${F_SANS}`;
    ctx.fillText("扫码查看规则与开奖验证", 72, H - 86);
    ctx.fillStyle = T.mono;
    ctx.font = `600 22px ${F_MONO}`;
    ctx.fillText(d.short, 72, H - 52);
    drawQR(ctx, d.url, W - 72 - 250, H - 300, 250, T);
  }
}

export async function campaignCardBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image encoding failed"))),
      "image/png",
    ),
  );
}
