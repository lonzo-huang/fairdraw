import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "涨粉攻略 — FairDraw" },
      { name: "description", content: "FairDraw 涨粉攻略：平台用法、参与方式、公平开奖与派奖的全部说明。" },
      { property: "og:title", content: "涨粉攻略 — FairDraw" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Guide,
});

const ITEMS = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11] as const;

function Guide() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold">{t("faq.title")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("faq.sub")}</p>
      <Accordion type="single" collapsible className="mt-10">
        {ITEMS.map((n) => (
          <AccordionItem key={n} value={`q${n}`}>
            <AccordionTrigger>{t(`faq.q${n}`)}</AccordionTrigger>
            <AccordionContent className="text-sm leading-7 text-muted-foreground">{t(`faq.a${n}`)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
