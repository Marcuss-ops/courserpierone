import { redirect } from "next/navigation";
import Link from "next/link";
import { User, Lock, CreditCard, Bell } from "lucide-react";
import { getServerUser } from "@/lib/supabase/get-user";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Impostazioni Account",
};

/**
 * AccountLayout — wrapper sidebar per le 4 pagine impostazioni utente:
 *   /account/profile         (Avatar + nome + bio + social)
 *   /account/password        (cambio password Supabase Auth)
 *   /account/payments        (storico ordini)
 *   /account/notifications   (preference centro notifiche)
 *
 * Auth: richiede login (`getServerUser` redirect a /login).
 * Theme: cream-dark-* (premium dark) per coerenza visiva con
 * dashboard, course area, profile page esistente.
 *
 * La sidebar mostra la "tab attiva" via confronto pathname lato server
 * — la classe active viene applicata via CSS lato client (Link + hover).
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  const sidebarItems = [
    { href: "/account/profile", label: "Profilo", Icon: User, key: "profile" },
    { href: "/account/password", label: "Password", Icon: Lock, key: "password" },
    { href: "/account/payments", label: "Pagamenti", Icon: CreditCard, key: "payments" },
    { href: "/account/notifications", label: "Notifiche", Icon: Bell, key: "notifications" },
  ];

  // Header name shown in sidebar header
  const displayName = dbUser.name?.trim() || dbUser.email.split("@")[0];

  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased relative overflow-x-hidden">
      {/* Warm glow overlay (matches dashboard) */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(255, 200, 130, 0.04) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12 pb-24">
        {/* Page header */}
        <div className="mb-8 lg:mb-10">
          <p className="text-[10px] text-cream-dark-text-soft uppercase tracking-widest font-semibold">
            Account
          </p>
          <h1 className="font-serif text-3xl lg:text-4xl text-cream-dark-text leading-tight tracking-[-0.02em] mt-1">
            Impostazioni
          </h1>
          <p className="text-sm text-cream-dark-text-soft font-light mt-2 max-w-2xl">
            Gestisci il tuo profilo, la sicurezza, lo storico pagamenti e le
            preferenze di notifica.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 lg:gap-10">
          {/* Sidebar */}
          <aside className="space-y-1">
            <div className="px-4 py-3 mb-3 bg-cream-dark-surface border border-cream-dark-border rounded-2xl">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-cream-dark-text-soft">
                Loggato come
              </p>
              <p className="text-sm font-semibold text-cream-dark-text mt-0.5 truncate">
                {displayName}
              </p>
              <p className="text-[11px] text-cream-dark-text-soft truncate">
                {dbUser.email}
              </p>
            </div>
            {sidebarItems.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-cream-dark-text-soft hover:text-cream-dark-text hover:bg-cream-dark-surface/60 border border-transparent hover:border-cream-dark-border transition-all duration-200"
              >
                <Icon className="w-4 h-4 group-hover:text-cream-dark-gold transition-colors" />
                {label}
              </Link>
            ))}
          </aside>

          {/* Main content */}
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
