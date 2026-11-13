import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n, type DictKey } from "@/lib/i18n";
import { BadgeCheck, Gift, ShieldCheck, Send } from "lucide-react";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "关于 FairDraw — 可验证的 X 抽奖涨粉平台" },
      { name: "description", content: "FairDraw 是面向 X（Twitter）的可验证抽奖平台：奖池担保、确定性开奖算法开源、结果可复核、派奖凭证公示。" },
      { property: "og:title", content: "关于 FairDraw" },
      { property: "og:description", content: "FairDraw 是面向 X（Twitter）的可验证抽奖平台：奖池担保、开奖算法开源、结果可复核、派奖凭证公示。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/about"),
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: "About FairDraw",
        url: "https://www.fairdraw.win/about",
        about: { "@type": "Organization", name: "FairDraw", url: "https://www.fairdraw.win/" },
      }),
    }],
  }),
  component: About,
});

const SECS: { t: DictKey; p: DictKey; I: typeof Gift }[] = [
  { t: "about.whatT", p: "about.whatP", I: Gift },
  { t: "about.howT", p: "about.howP", I: ShieldCheck },
  { t: "about.whoT", p: "about.whoP", I: BadgeCheck },
];

export function About() {
  const { t, lp } = useI18n();
  return (
    <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <p className="font-mono text-xs text-prize">FAIRDRAW / ABOUT</p>
      <h1 className="mt-3 text-3xl font-semibold">{t("about.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("about.sub")}</p>

      <div className="mt-10 space-y-8">
        {SECS.map(({ t: tk, p: pk, I }) => (
          <article key={tk} className="rounded-xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><I className="size-5 text-prize" />{t(tk)}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{t(pk)}</p>
          </article>
        ))}

        <article className="rounded-xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Send className="size-5 text-prize" />{t("about.contactT")}</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{t("about.contactP")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a className="text-sm text-primary hover:underline" href="https://x.com/FairDraw" target="_blank" rel="noopener noreferrer">@FairDraw on X</a>
            <Link className="text-sm text-primary hover:underline" to={lp("/contact") as never}>{t("footer.contact")}</Link>
            <a className="text-sm text-primary hover:underline" href="https://github.com/lonzo-huang/fairdraw/blob/main/src/lib/draw.ts" target="_blank" rel="noopener noreferrer">src/lib/draw.ts · GitHub</a>
          </div>
        </article>
      </div>
    </section>
  );
}
