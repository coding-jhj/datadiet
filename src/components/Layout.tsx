import { Leaf } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { APP_NAME, PAPER_TITLE, copy } from "@/copy/en";

export function Layout() {
  const link = ({ isActive }: { isActive: boolean }) => `whitespace-nowrap rounded-lg px-2 py-2 sm:px-3 text-[0.8125rem] font-medium sm:text-sm ${isActive ? "bg-accent-soft text-accent" : "text-muted hover:text-fg"}`;
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-3">
          <Link to="/" className="flex items-center gap-1.5 text-lg font-bold">
            <Leaf aria-hidden className="text-accent" size={22} />
            {APP_NAME}
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink to="/evidence" className={link}>{copy.nav.evidence}</NavLink>
            <NavLink to="/how-it-works" className={link}>{copy.nav.how}</NavLink>
            <NavLink to="/about" className={link}>{copy.nav.about}</NavLink>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-line py-6 text-center text-sm text-muted">
        <p className="mx-auto max-w-2xl px-4">
          {copy.landing.privacy} · {PAPER_TITLE}
        </p>
      </footer>
    </div>
  );
}
