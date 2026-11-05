import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection, type LegalSec, type LegalSum } from "@/components/legal-page";
import { useI18n } from "@/lib/i18n";
import { AlertTriangle, CheckCircle2, CreditCard, DollarSign, Eye, MessageCircle, Pencil, Trash2, Download } from "lucide-react";

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

const SECS: LegalSec[] = [
  { id: "p-collect", n: "01", t: "pp.h1" },
  { id: "p-use", n: "02", t: "pp.h2" },
  { id: "p-third", n: "03", t: "pp.h3" },
  { id: "p-keep", n: "04", t: "pp.h4" },
  { id: "p-rights", n: "05", t: "pp.h5" },
  { id: "p-cookie", n: "06", t: "pp.h6" },
  { id: "p-contact", n: "07", t: "pp.h7" },
];

const SUM: LegalSum[] = [
  { I: MessageCircle, bg: "rgba(59,130,246,.14)", color: "#8ab4ff", b: "pp.sc1t", p: "pp.sc1p" },
  { I: CreditCard, bg: "rgba(52,211,153,.12)", color: "#34d399", b: "pp.sc2t", p: "pp.sc2p" },
  { I: DollarSign, bg: "rgba(245,184,61,.12)", color: "#f5b83d", b: "pp.sc3t", p: "pp.sc3p" },
  { I: Trash2, bg: "rgba(124,92,255,.14)", color: "#a99bff", b: "pp.sc4t", p: "pp.sc4p" },
];

function Privacy() {
  const { t } = useI18n();
  return (
    <LegalPage doc="privacy" titleKey="pp.title" secs={SECS} sum={SUM}>
      <LegalSection id="p-collect" n="01" t="pp.h1">
        <p>{t("pp.p1")}</p>
        <div className="tbl">
          <table>
            <thead><tr><th>{t("pp.th1")}</th><th>{t("pp.th2")}</th><th>{t("pp.th3")}</th></tr></thead>
            <tbody>
              <tr><td>{t("pp.r1a")}</td><td>{t("pp.r1b")}</td><td><span className="chip c-pri">{t("lg.chipPri")}</span></td></tr>
              <tr><td>{t("pp.r2a")}</td><td>{t("pp.r2b")}</td><td><span className="chip c-pub">{t("pp.r2c")}</span></td></tr>
              <tr>
                <td>{t("pp.r3a")}<br /><span style={{ fontWeight: 400, color: "#646f85", fontSize: 13 }}>{t("pp.r3aS")}</span></td>
                <td>{t("pp.r3b")}</td><td><span className="chip c-pub">{t("pp.r3c")}</span></td>
              </tr>
              <tr><td>{t("pp.r4a")}</td><td>{t("pp.r4b")}</td><td><span className="chip c-pri">{t("lg.chipPri")}</span></td></tr>
              <tr><td>{t("pp.r5a")}</td><td>—</td><td><span className="chip c-no">{t("lg.chipNo")}</span></td></tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection id="p-use" n="02" t="pp.h2">
        <p>{t("pp.p2")}</p>
        <ul>
          <li><b>{t("pp.u1b")}</b>：{t("pp.u1d")}</li>
          <li><b>{t("pp.u2b")}</b>：{t("pp.u2d")}</li>
          <li><b>{t("pp.u3b")}</b>：{t("pp.u3d")}</li>
          <li><b>{t("pp.u4b")}</b>：{t("pp.u4d")}</li>
        </ul>
        <div className="callout good"><CheckCircle2 /><div><b>{t("pp.co2a")}</b>{t("pp.co2b")}</div></div>
      </LegalSection>

      <LegalSection id="p-third" n="03" t="pp.h3">
        <p>{t("pp.p3")}</p>
        <div className="svc">
          <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer"><span className="lg" style={{ background: "#1f9d6a" }}>S</span><div><b>Supabase</b><span>{t("pp.svc1s")}</span></div><span className="ext">↗</span></a>
          <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer"><span className="lg" style={{ background: "#635bff" }}>S</span><div><b>Stripe</b><span>{t("pp.svc2s")}</span></div><span className="ext">↗</span></a>
          <a href="https://x.com/privacy" target="_blank" rel="noopener noreferrer"><span className="lg" style={{ background: "#000", border: "1px solid #333" }}>X</span><div><b>X（Twitter）</b><span>{t("pp.svc3s")}</span></div><span className="ext">↗</span></a>
          <a href="https://unavatar.io" target="_blank" rel="noopener noreferrer"><span className="lg" style={{ background: "#334155" }}>U</span><div><b>unavatar</b><span>{t("pp.svc4s")}</span></div><span className="ext">↗</span></a>
        </div>
      </LegalSection>

      <LegalSection id="p-keep" n="04" t="pp.h4">
        <p>{t("pp.p4")}</p>
        <div className="flow">
          <div className="ok"><b>{t("pp.f1t")}</b>{t("pp.f1d")}</div>
          <div><b>{t("pp.f2t")}</b>{t("pp.f2d")}</div>
          <div><b>{t("pp.f3t")}</b>{t("pp.f3d")}</div>
        </div>
        <div className="callout warn"><AlertTriangle /><div>{t("pp.co4a")}<Link to="/contact">{t("ct.title")}</Link>{t("pp.co4b")}</div></div>
      </LegalSection>

      <LegalSection id="p-rights" n="05" t="pp.h5">
        <p>{t("pp.p5a")} <b>{t("pp.p5b")}</b> {t("pp.p5c")}</p>
        <div className="rights">
          <div><Eye /><div><b>{t("pp.rg1b")}</b>{t("pp.rg1d")}</div></div>
          <div><Pencil /><div><b>{t("pp.rg2b")}</b>{t("pp.rg2d")}</div></div>
          <div><Trash2 /><div><b>{t("pp.rg3b")}</b>{t("pp.rg3d")}</div></div>
          <div><Download /><div><b>{t("pp.rg4b")}</b>{t("pp.rg4d")}</div></div>
        </div>
      </LegalSection>

      <LegalSection id="p-cookie" n="06" t="pp.h6">
        <p>{t("pp.p6a")}<b>{t("pp.p6b")}</b>{t("pp.p6c")}</p>
      </LegalSection>

      <LegalSection id="p-contact" n="07" t="pp.h7">
        <p>
          {t("pp.p7a")}<Link to="/contact">{t("ct.title")}</Link>{t("pp.p7b")}{" "}
          <a href="https://x.com/Mirrortekuk" target="_blank" rel="noopener noreferrer">@Mirrortekuk</a>{" "}
          {t("pp.p7c")}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
