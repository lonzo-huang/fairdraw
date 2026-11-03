import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "问题咨询 — FairDraw" },
      { name: "description", content: "联系 FairDraw：活动问题、开奖异议、合作接入。" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { t } = useI18n();
  const items = [
    { k: "mail", icon: <Mail className="size-4 text-primary" /> },
    { k: "camp", icon: null },
    { k: "dispute", icon: null },
    { k: "partner", icon: null },
  ] as const;
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold">{t("ct.title")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("ct.sub")}</p>
      <div className="mt-10 space-y-6">
        {items.map(({ k, icon }) => (
          <section key={k} className="rounded-xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-medium">{icon}{t(`ct.${k}`)}</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{t(`ct.${k}D`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
