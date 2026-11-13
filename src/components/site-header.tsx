import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Menu, X } from "lucide-react";
const logoSrc = "/fairdraw-logo-dark-bg.svg";

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center" aria-label="FairDraw">
      <img src={logoSrc} alt="FairDraw" className="h-9 w-auto object-contain" />
    </Link>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onHome = pathname === "/";
  const [navOpen, setNavOpen] = useState(false);
  const headRef = useRef<HTMLElement>(null);
  // Mobile nav: close on route change; outside-tap via contains-check (React
  // delegates on document, so stopPropagation can't block a sibling listener).
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (headRef.current && !headRef.current.contains(e.target as Node)) setNavOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const { data: isAdmin } = useQuery({ queryKey: ["is-admin"], queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return false;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    return !!data;
  }, enabled: !!user });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  }

  const navLinkCls = "block border-t border-border/40 px-2 py-3 text-sm text-muted-foreground hover:text-foreground";
  return (
    <header ref={headRef} className="sticky top-0 z-30 border-b border-primary/15 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          {onHome ? <a href="#campaigns" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">{t("cy.live")}</a> : <Link to="/" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">{t("cy.live")}</Link>}
          <Link to="/guide" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">{t("nav.guide")}</Link>
          <Link to="/affiliate" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">{t("nav.affiliate")}</Link>
          {user && (
            <>
              <Link to="/dashboard" className="px-2 text-muted-foreground hover:text-foreground">
                {t("nav.dashboard")}
              </Link>
              {isAdmin && (
                <Link to="/admin" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">
                  {t("nav.admin")}
                </Link>
              )}
            </>
          )}
          <Button variant="ghost" size="sm"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            className="font-mono text-xs text-muted-foreground"
            aria-label={t("home.switchLang")}
          >
            {lang === "zh" ? "EN" : "中文"}
          </Button>
          {user ? (
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t("nav.signout")}
            </Button>
          ) : (
            <Button asChild size="sm" variant="glass">
              <Link to="/auth" search={{ redirect: undefined }}>{t("nav.signin")}<ArrowUpRight /></Link>
            </Button>
          )}
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden"
            aria-expanded={navOpen}
            aria-label="Menu"
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>
      {navOpen && (
        <div className="absolute inset-x-0 top-full border-b border-primary/15 bg-background/95 shadow-lg backdrop-blur-xl sm:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-5 pb-2 sm:px-8">
            {onHome ? (
              <a href="#campaigns" className={navLinkCls} onClick={() => setNavOpen(false)}>{t("cy.live")}</a>
            ) : (
              <Link to="/" className={navLinkCls}>{t("cy.live")}</Link>
            )}
            <Link to="/guide" className={navLinkCls}>{t("nav.guide")}</Link>
            <Link to="/affiliate" className={navLinkCls}>{t("nav.affiliate")}</Link>
            {user && <Link to="/dashboard" className={navLinkCls}>{t("nav.dashboard")}</Link>}
            {user && isAdmin && <Link to="/admin" className={navLinkCls}>{t("nav.admin")}</Link>}
          </nav>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6"><div><Logo /><p className="mt-3 text-xs text-muted-foreground">{t("cy.footer")}</p></div><div className="flex gap-6 text-xs text-muted-foreground"><Link to="/">{t("cy.live")}</Link><Link to="/guide">{t("nav.guide")}</Link><Link to="/affiliate">{t("nav.affiliate")}</Link><Link to="/new">{t("cy.start")}</Link><Link to="/privacy">{t("footer.privacy")}</Link><Link to="/terms">{t("footer.terms")}</Link><Link to="/contact">{t("footer.contact")}</Link></div></div>
      </div>
    </footer>
  );
}
