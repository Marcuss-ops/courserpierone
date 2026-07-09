import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User as UserIcon } from "lucide-react";
import { getServerUser } from "@/lib/supabase/get-user";
import { ProfileForm } from "./profile-form";

export const metadata = {
  title: "Modifica Profilo",
};

export default async function ProfilePage() {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased relative overflow-x-hidden">
      {/* Warm glow overlay (same as dashboard) */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(255, 200, 130, 0.04) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      {/* Top bar — minimal */}
      <nav className="sticky top-0 z-50 bg-cream-dark-bg/80 backdrop-blur-xl border-b border-cream-dark-border">
        <div className="max-w-3xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-cream-dark-text-soft hover:text-cream-dark-text transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Torna alla Dashboard
          </Link>
          <span className="text-xs text-cream-dark-text-soft uppercase tracking-widest">Account</span>
        </div>
      </nav>

      <main className="relative max-w-3xl mx-auto px-6 py-10 lg:py-12 pb-24 space-y-8">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center shadow-md shrink-0">
            <UserIcon className="w-5 h-5 text-cream-espresso" />
          </div>
          <div>
            <h1 className="font-serif text-3xl lg:text-4xl text-cream-dark-text leading-tight tracking-[-0.02em]">
              Modifica Profilo
            </h1>
            <p className="text-sm text-cream-dark-text-soft font-light mt-1">
              Aggiorna il tuo nome visualizzato. L'email non può essere modificata.
            </p>
          </div>
        </div>

        {/* Form card (cream on dark) */}
        <ProfileForm initialName={dbUser.name ?? ""} />
      </main>
    </div>
  );
}
