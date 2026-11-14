import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ChevronDown, Menu, X, Zap } from "lucide-react";
const logoSrc = "/fairdraw-logo-dark-bg.svg";

export function Logo() {
  const { lp } = useI18n();
  return (
    <Link to={lp("/") as never} className="flex shrink-0 items-center" aria-label="FairDraw">
      <img src={logoSrc} alt="FairDraw X 抽奖助手" className="h-9 w-auto object-contain" />
    </Link>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const { t, lang, setLang, lp } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onHome = pathname === (lp("/") as string);
  const [navOpen, setNavOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const headRef = useRef<HTMLElement>(null);
  // Mobile nav + account menu: close on route change; outside-tap via
  // contains-check (React delegates on document, so stopPropagation can't
  // block a sibling listener).
  useEffect(() => { setNavOpen(false); setMeOpen(false); }, [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (headRef.current && !headRef.current.contains(e.target as Node)) { setNavOpen(false); setMeOpen(false); }
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

  const meName =
    (user?.user_metadata?.display_name as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split("@")[0] ?? "";
  const meInitial = (meName.trim()[0] ?? "F").toUpperCase();
  const navLinks = [
    { to: "/", label: t("cy.live") },
    { to: "/verify", label: t("nav.check") },
    { to: "/guide", label: t("nav.guide") },
    { to: "/affiliate", label: t("nav.affiliate") },
  ];
  const navCls = (on: boolean) =>
    `relative rounded-lg px-3.5 py-2 text-[14.5px] font-medium transition-colors ${
      on
        ? "text-foreground after:absolute after:inset-x-3 after:-bottom-4 after:h-0.5 after:rounded-full after:bg-success"
        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
    }`;
  const menuItemCls = "block w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground";
  const navLinkCls = "block border-t border-border/40 px-2 py-3 text-sm text-muted-foreground hover:text-foreground";
  return (
    <header ref={headRef} className="sticky top-0 z-30 border-b border-primary/15 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-8 px-5 sm:px-8">
        <Logo />
        <nav className="hidden flex-1 items-center gap-1 sm:flex">
          {navLinks.map((l) =>
            l.to === "/" && onHome ? (
              <a key={l.to} href="#campaigns" className={navCls(true)}>{l.label}</a>
            ) : (
              <Link key={l.to} to={lp(l.to) as never} className={navCls(pathname === (lp(l.to) as string))}>{l.label}</Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            className="rounded-full border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
            aria-label={t("home.switchLang")}
          >
            {lang === "zh" ? "EN" : "中文"}
          </button>
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMeOpen((v) => !v)}
                aria-expanded={meOpen}
                className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2.5 text-[13.5px] font-medium text-foreground transition-colors hover:border-foreground/25"
              >
                <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] text-[11px] font-bold text-white">{meInitial}</span>
                <span className="max-w-20 truncate">{meName}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </button>
              {meOpen && (
                <div className="absolute right-0 top-11 z-40 w-44 rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
                  <Link to="/dashboard" className={menuItemCls}>{t("nav.dashboard")}</Link>
                  <Link to={lp("/affiliate") as never} className={menuItemCls}>{t("nav.affiliate")}</Link>
                  {isAdmin && <Link to="/admin" className={menuItemCls}>{t("nav.admin")}</Link>}
                  <hr className="my-1.5 border-border" />
                  <button type="button" onClick={signOut} className={menuItemCls}>{t("nav.signout")}</button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/auth" search={{ redirect: undefined }} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5">
              {t("nav.signin")}
            </Link>
          )}
          <Button asChild size="sm" variant="neon" className="hidden sm:inline-flex">
            <Link to="/new"><Zap className="size-3.5" />{t("nav.new")}</Link>
          </Button>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden"
            aria-expanded={navOpen}
            aria-label="Menu"
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {navOpen && (
        <div className="absolute inset-x-0 top-full border-b border-primary/15 bg-background/95 shadow-lg backdrop-blur-xl sm:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-5 pb-2 sm:px-8">
            {onHome ? (
              <a href="#campaigns" className={navLinkCls} onClick={() => setNavOpen(false)}>{t("cy.live")}</a>
            ) : (
              <Link to={lp("/") as never} className={navLinkCls}>{t("cy.live")}</Link>
            )}
            <Link to={lp("/verify") as never} className={navLinkCls}>{t("nav.check")}</Link>
            <Link to={lp("/guide") as never} className={navLinkCls}>{t("nav.guide")}</Link>
            <Link to={lp("/affiliate") as never} className={navLinkCls}>{t("nav.affiliate")}</Link>
            <Link to="/new" className={navLinkCls}>{t("nav.new")}</Link>
            {user && <Link to="/dashboard" className={navLinkCls}>{t("nav.dashboard")}</Link>}
            {user && isAdmin && <Link to="/admin" className={navLinkCls}>{t("nav.admin")}</Link>}
            {!user && <Link to="/auth" search={{ redirect: undefined }} className={navLinkCls}>{t("nav.signin")}</Link>}
          </nav>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { t, lp } = useI18n();
  const itemCls = "text-sm text-muted-foreground transition-colors hover:text-foreground";
  const cols: { h: string; items: { to?: string; href?: string; label: string; raw?: boolean }[] }[] = [
    {
      h: t("ft.prod"),
      items: [
        { to: "/", label: t("cy.live") },
        { to: "/new", label: t("nav.new"), raw: true },
        { to: "/verify", label: t("nav.check") },
        { to: "/archive", label: t("nav.archive") },
      ],
    },
    {
      h: t("ft.res"),
      items: [
        { to: "/guide", label: t("nav.guide") },
        { to: "/faq/payment", label: t("ft.pay") },
        { to: "/affiliate", label: t("nav.affiliate") },
        { href: "https://github.com/lonzo-huang/fairdraw/blob/main/src/lib/draw.ts", label: t("ft.algo") },
      ],
    },
    {
      h: t("ft.about"),
      items: [
        { to: "/about", label: t("ft.aboutFd") },
        { to: "/contact", label: t("footer.contact") },
        { to: "/privacy", label: t("footer.privacy") },
        { to: "/terms", label: t("footer.terms") },
      ],
    },
  ];
  return (
    <>
      <section className="cta-band border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-10 sm:px-8">
          <div>
            <h3 className="font-display text-[26px] font-bold">{t("ft.bandT")}</h3>
            <p className="mt-1 text-[15px] text-muted-foreground">{t("ft.bandP")}</p>
          </div>
          <Button asChild variant="neon" size="lg">
            <Link to="/new"><Zap />{t("cy.start")}<ArrowUpRight /></Link>
          </Button>
        </div>
      </section>
      <footer className="border-t border-border bg-[#080b12]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-5 pt-12 pb-10 sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:px-8">
          <div className="col-span-2 sm:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">{t("cy.footer")}</p>
            <a
              href="https://x.com/FairDraw"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-[13px] text-foreground transition-colors hover:border-foreground/25"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.6-8.7L1.5 2h6.8l4.7 6.2zm-1.2 18h1.8L7.3 3.9H5.4z"/></svg>
              @FairDraw
            </a>
          </div>
          {cols.map((col) => (
            <div key={col.h}>
              <h4 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{col.h}</h4>
              <ul className="space-y-2.5">
                {col.items.map((it) => (
                  <li key={it.label}>
                    {it.href ? (
                      <a href={it.href} target="_blank" rel="noopener noreferrer" className={itemCls}>{it.label}</a>
                    ) : (
                      <Link to={(it.raw ? it.to : lp(it.to ?? "/")) as never} className={itemCls}>{it.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-muted-foreground/70 sm:px-8">
            <span>{t("ft.legal")}</span>
            <span>{t("ft.lang")}</span>
          </div>
        </div>
      </footer>
    </>
  );
}
