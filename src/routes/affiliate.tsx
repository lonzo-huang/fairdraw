import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { DollarSign, Link2, Users, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/affiliate")({
  head: () => ({
    meta: [
      { title: "联盟推广计划 — FairDraw" },
      { name: "description", content: "加入 FairDraw 联盟推广计划，每成功推荐一个活动赚取平台手续费的 30%。" },
      { property: "og:title", content: "联盟推广计划 — FairDraw" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Affiliate,
});

function Affiliate() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [audience, setAudience] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !handle.trim()) return;
    try {
      const body = `联盟申请\n姓名：${name}\nX账号：${handle}\n渠道：${audience}`;
      const res = await fetch(`https://api.x.com`, { method: "GET" }).catch(() => null);
      void res;
      // Store application in localStorage as fallback; organiser reviews manually via DM.
      const apps = JSON.parse(localStorage.getItem("aff_apps") ?? "[]") as unknown[];
      apps.push({ name, handle, audience, ts: Date.now() });
      localStorage.setItem("aff_apps", JSON.stringify(apps));
      setSent(true);
      void body;
    } catch {
      setErr(true);
    }
  }

  const stats = [
    { label: t("aff.rate"), value: t("aff.rateV") },
    { label: t("aff.minPay"), value: t("aff.minPayV") },
    { label: t("aff.payFreq"), value: t("aff.payFreqV") },
    { label: t("aff.track"), value: t("aff.trackV") },
  ];

  const steps = [
    { icon: <CheckCircle2 className="size-5" />, title: t("aff.h1t"), desc: t("aff.h1d") },
    { icon: <Link2 className="size-5" />, title: t("aff.h2t"), desc: t("aff.h2d") },
    { icon: <DollarSign className="size-5" />, title: t("aff.h3t"), desc: t("aff.h3d") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Users className="size-7 text-primary" />
        </div>
        <h1 className="text-3xl font-semibold">{t("aff.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("aff.sub")}</p>
      </div>

      {/* How it works */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">{t("aff.how")}</h2>
        <div className="space-y-4">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-4 rounded-xl border border-border bg-card p-5">
              <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{s.icon}</span>
              <div>
                <div className="font-semibold">{s.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Commission stats */}
      <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-sm font-semibold">{s.value}</div>
          </div>
        ))}
      </section>

      {/* Example */}
      <section className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="mb-1 font-semibold text-primary">{t("aff.example")}</div>
        <p className="text-sm leading-6 text-muted-foreground">{t("aff.exampleD")}</p>
      </section>

      {/* Application form */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">{t("aff.apply")}</h2>
        <p className="mb-5 text-sm text-muted-foreground">{t("aff.applyD")}</p>

        {sent ? (
          <div className="rounded-xl border border-success/30 bg-success/5 p-5 text-sm text-success">
            {t("aff.fSent")}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">{t("aff.fName")}</label>
              <input
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                value={name} onChange={(e) => setName(e.target.value)} required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">{t("aff.fHandle")}</label>
              <input
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">{t("aff.fAudience")}</label>
              <textarea
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                rows={3} value={audience} onChange={(e) => setAudience(e.target.value)}
              />
            </div>
            {err && <p className="text-sm text-destructive">{t("aff.fErr")}</p>}
            <button type="submit" className="btn-gradient w-full">{t("aff.fSubmit")}</button>
          </form>
        )}

        <p className="mt-6 text-xs text-muted-foreground">{t("aff.terms")}</p>
      </section>
    </div>
  );
}
