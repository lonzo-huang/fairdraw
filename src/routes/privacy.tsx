import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "隐私声明 — FairDraw" },
      { name: "description", content: "FairDraw 收集哪些数据、如何使用、保留多久。" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  const { t } = useI18n();
  const sections = [1, 2, 3, 4, 5] as const;
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold">{t("pp.title")}</h1>
      <div className="mt-10 space-y-8">
        {sections.map((n) => (
          <section key={n}>
            <h2 className="text-lg font-medium">{t(`pp.s${n}h`)}</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{t(`pp.s${n}b`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
