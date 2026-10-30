import banner from "@/assets/giveaway-banner.jpg";
import { translate } from "@/lib/i18n";
import { conditionSummary, prizeSummary, shareModel, type ShareCampaign } from "@/lib/campaign-share";

/** Fixed-size bitmap with real campaign data; browser APIs run only on invocation. */
export async function renderShareImage(c: ShareCampaign): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const css = getComputedStyle(document.documentElement);
  const color = (token: string) => css.getPropertyValue(`--${token}`).trim();
  const font = '"Noto Sans SC", "IBM Plex Sans", sans-serif';
  const m = shareModel(c);
  ctx.fillStyle = color("card"); ctx.fillRect(0, 0, 1200, 630);
  const image = new Image();
  image.src = banner;
  try { await image.decode(); ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, 1200, 220); } catch { /* Text remains complete without background art. */ }
  ctx.fillStyle = color("primary"); ctx.fillRect(0, 0, 12, 630);
  ctx.font = `600 26px ${font}`; ctx.fillText(translate(m.language, "share.brand"), 52, 60);
  const wrap = (text: string, x: number, y: number, width: number, size: number, maxLines: number) => {
    ctx.font = `600 ${size}px ${font}`;
    const lines: string[] = []; let line = "";
    for (const character of text) {
      if (ctx.measureText(line + character).width > width && line) { lines.push(line); line = character; } else line += character;
    }
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((value, i) => {
      let output = value;
      if (i === maxLines - 1 && lines.length > maxLines) {
        while (ctx.measureText(output + "…").width > width) output = output.slice(0, -1);
        output += "…";
      }
      ctx.fillText(output, x, y + i * size * 1.4);
    });
  };
  ctx.fillStyle = color("foreground"); wrap(c.title, 52, 125, 760, 40, 2);
  ctx.fillStyle = color("primary"); wrap(prizeSummary(c), 52, 272, 1096, 38, 2);
  ctx.fillStyle = color("foreground"); wrap(conditionSummary(c), 52, 385, 1096, 24, 3);
  ctx.fillStyle = color("muted-foreground"); ctx.font = `500 22px ${font}`;
  ctx.fillText(translate(m.language, "share.duration", { days: m.days, count: m.winners }), 52, 532);
  ctx.strokeStyle = color("border"); ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(52, 552); ctx.lineTo(1148, 552); ctx.stroke();
  ctx.fillStyle = color("muted-foreground"); ctx.font = `400 18px ${font}`;
  wrap(translate(m.language, "share.payment"), 52, 588, 830, 18, 1);
  ctx.fillStyle = color("primary"); ctx.font = `600 22px ${font}`; ctx.fillText("fairdraw.win", 975, 590);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image encoding failed")), "image/jpeg", 0.9));
}