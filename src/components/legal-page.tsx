import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { legalReadingTime, translate, useI18n } from "@/lib/i18n";
import { CalendarDays, Clock, FileText, Printer, ShieldCheck } from "lucide-react";

export type LegalSec = { id: string; n: string; t: string };
export type LegalSum = { I: typeof ShieldCheck; bg: string; color: string; b: string; p: string };

type Props = {
  doc: "privacy" | "terms";
  titleKey: string;
  secs: LegalSec[];
  sum: LegalSum[];
  children: ReactNode; // the <article> sections
};

/** Shared chrome for the legal mockup: doc switch, summary cards, sticky TOC, section anchors. */
export function LegalPage({ doc, titleKey, secs, sum, children }: Props) {
  const { t, lang, lp } = useI18n();
  const [on, setOn] = useState(secs[0]?.id ?? "");
  const rt = legalReadingTime(doc, lang);
  const artRef = useRef<HTMLElement>(null);

  // Scroll-spy + deep-link scroll (reading time is computed above, SSR-safe).
  useEffect(() => {
    const el = artRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((en) => en.isIntersecting && setOn(en.target.id)),
      { rootMargin: "-30% 0px -60% 0px" },
    );
    el.querySelectorAll("section").forEach((s) => io.observe(s));
    const h = location.hash.slice(1);
    if (h && document.getElementById(h)) setTimeout(() => document.getElementById(h)?.scrollIntoView(), 60);
    return () => io.disconnect();
  }, [lang]);

  const copyAnchor = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a.anc");
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute("href")?.slice(1) ?? "";
    navigator.clipboard.writeText(`${location.origin}${location.pathname}#${id}`).catch(() => {});
    toast.success(t("lg.ancCopied"));
  };

  return (
    <div className="page-lg">
      <main className="wrap">
        <div className="head">
          <div>
            <nav className="switch" aria-label={t("lg.switch")}>
              <Link to={lp("/privacy") as never} className={doc === "privacy" ? "on" : ""} aria-current={doc === "privacy" ? "page" : undefined}>
                <ShieldCheck />{t("lg.privacy")}
              </Link>
              <Link to={lp("/terms") as never} className={doc === "terms" ? "on" : ""} aria-current={doc === "terms" ? "page" : undefined}>
                <FileText />{t("lg.terms")}
              </Link>
            </nav>
            <h1>{t(titleKey)}</h1>
            <div className="meta">
              <span><CalendarDays />{t("lg.updated")} <i style={{ fontStyle: "normal", color: "#9aa4b8" }}>{t("lg.updatedD")}</i></span>
              <span><Clock />{t("lg.readA")} <b style={{ color: "#9aa4b8", fontWeight: 500 }}>{rt}</b> {t("lg.min")}</span>
            </div>
          </div>
          <div className="tools">
            <button type="button" className="ghost" onClick={() => window.print()}><Printer />{t("lg.print")}</button>
          </div>
        </div>

        <div className="sum">
          <div className="sum-h">{t("lg.sumTitle")} <span>{t("lg.sumNote")}</span></div>
          <div className="sum-g">
            {sum.map((s) => (
              <div key={s.b} className="sc">
                <span className="ic" style={{ background: s.bg, color: s.color }}><s.I /></span>
                <b>{t(s.b)}</b>
                <p>{t(s.p)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="doc">
          <aside className="toc">
            <div className="t">{t("lg.toc")}</div>
            <ol>
              {secs.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={on === s.id ? "on" : ""}
                    onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" }); history.replaceState(null, "", `#${s.id}`); }}>
                    <span className="n">{s.n}</span>{t(s.t)}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
          <article ref={artRef} onClick={copyAnchor}>{children}</article>
        </div>

        <div className="contact">
          <div><h3>{t("lg.contactH")}</h3><p>{t("lg.contactP")}</p></div>
          <Link className="btn" to={lp("/contact") as never}>{t("lg.contactBtn")}</Link>
        </div>
      </main>
    </div>
  );
}

/** Numbered section with a hover anchor link. */
export function LegalSection({ id, n, t, children }: { id: string; n: string; t: string; children: ReactNode }) {
  const { t: tr } = useI18n();
  return (
    <section id={id}>
      <h2><span className="n">{n}</span>{tr(t)}<a className="anc" href={`#${id}`} aria-label={`#${id}`}>#</a></h2>
      {children}
    </section>
  );
}
