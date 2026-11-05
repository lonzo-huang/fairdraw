import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection, type LegalSec, type LegalSum } from "@/components/legal-page";
import { useI18n } from "@/lib/i18n";
import { AlertTriangle, Ban, Gift, RotateCcw, User } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "使用条款 — FairDraw" },
      { name: "description", content: "FairDraw 平台的使用规则、奖池与退款政策。" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Terms,
});

const SECS: LegalSec[] = [
  { id: "t-service", n: "01", t: "tt.h1" },
  { id: "t-join", n: "02", t: "tt.h2" },
  { id: "t-fee", n: "03", t: "tt.h3" },
  { id: "t-refund", n: "04", t: "tt.h4" },
  { id: "t-ban", n: "05", t: "tt.h5" },
  { id: "t-change", n: "06", t: "tt.h6" },
  { id: "t-law", n: "07", t: "tt.h7" },
];

const SUM: LegalSum[] = [
  { I: Gift, bg: "rgba(245,184,61,.12)", color: "#f5b83d", b: "tt.sc1t", p: "tt.sc1p" },
  { I: User, bg: "rgba(59,130,246,.14)", color: "#8ab4ff", b: "tt.sc2t", p: "tt.sc2p" },
  { I: RotateCcw, bg: "rgba(52,211,153,.12)", color: "#34d399", b: "tt.sc3t", p: "tt.sc3p" },
  { I: Ban, bg: "rgba(248,113,113,.12)", color: "#f87171", b: "tt.sc4t", p: "tt.sc4p" },
];

function Terms() {
  const { t } = useI18n();
  return (
    <LegalPage doc="terms" titleKey="tt.title" secs={SECS} sum={SUM}>
      <LegalSection id="t-service" n="01" t="tt.h1">
        <p>{t("tt.p1")}</p>
        <div className="flow" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><b>{t("tt.f1t")}</b>{t("tt.f1d")}</div>
          <div className="ok"><b>{t("tt.f2t")}</b>{t("tt.f2d")}</div>
        </div>
      </LegalSection>

      <LegalSection id="t-join" n="02" t="tt.h2">
        <ul>
          <li>{t("tt.u1a")} <a href="https://help.x.com/en/rules-and-policies" target="_blank" rel="noopener noreferrer">{t("tt.u1l")}</a></li>
          <li><b>{t("tt.u2a")}</b>{t("tt.u2b")}</li>
          <li>{t("tt.u3a")}<b>{t("tt.u3b")}</b></li>
          <li>{t("tt.u4a")}<b>{t("tt.u4b")}</b>{t("tt.u4c")}</li>
        </ul>
      </LegalSection>

      <LegalSection id="t-fee" n="03" t="tt.h3">
        <p>{t("tt.p3")}</p>
        <div className="tbl">
          <table>
            <thead><tr><th>{t("tt.th1")}</th><th>{t("tt.th2")}</th></tr></thead>
            <tbody>
              <tr><td>{t("tt.fe1")}</td><td>8%</td></tr>
              <tr><td>{t("tt.fe2")}</td><td>6%</td></tr>
              <tr><td>{t("tt.fe3")}</td><td>4%</td></tr>
            </tbody>
          </table>
        </div>
        <div className="callout warn"><AlertTriangle /><div><b>{t("tt.co3a")}</b>{t("tt.co3b")}</div></div>
      </LegalSection>

      <LegalSection id="t-refund" n="04" t="tt.h4">
        <p>{t("tt.p4")}</p>
        <div className="flow">
          <div><b>{t("tt.rf1t")}</b>{t("tt.rf1d")}</div>
          <div><b>{t("tt.rf2t")}</b>{t("tt.rf2d")}</div>
          <div><b>{t("tt.rf3t")}</b>{t("tt.rf3d")}</div>
        </div>
      </LegalSection>

      <LegalSection id="t-ban" n="05" t="tt.h5">
        <div className="callout bad"><Ban /><div>
          <ul style={{ margin: 0 }}>
            <li>{t("tt.b1")}</li>
            <li>{t("tt.b2")}</li>
            <li>{t("tt.b3")}</li>
            <li>{t("tt.b4")}</li>
          </ul>
        </div></div>
        <p style={{ marginTop: 14 }}>{t("tt.p5a")}<b>{t("tt.p5b")}</b>{t("tt.p5c")}</p>
      </LegalSection>

      <LegalSection id="t-change" n="06" t="tt.h6">
        <p>{t("tt.p6")}</p>
        <p>{t("tt.p6b")}</p>
      </LegalSection>

      <LegalSection id="t-law" n="07" t="tt.h7">
        <p>
          {t("tt.p7a")}<Link to="/contact">{t("ct.title")}</Link>{t("tt.p7b")}{" "}
          <a href="https://x.com/Mirrortekuk" target="_blank" rel="noopener noreferrer">@Mirrortekuk</a>{" "}
          {t("tt.p7c")}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
