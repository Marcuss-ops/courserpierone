import { getServerUser } from "@/lib/supabase/get-user";
import { PasswordForm } from "./password-form";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * /account/password — supabase.auth.updateUser({ password }) flow.
 *
 * Two-step client-side:
 *   1. signInWithPassword({email, current}) — verify current password.
 *   2. updateUser({password: new}) — apply the change.
 *
 * V1 deliberately NOT using our own server route — Supabase Auth is the
 * source-of-truth for credentials. Server-side verification would mean
 * holding the password in our DB (NO).
 */
export default async function PasswordPage() {
  const { dbUser } = await getServerUser();
  if (!dbUser) return null;

  return (
    <div className="space-y-6">
      <div className="bg-cream-card border border-cream-border rounded-[28px] p-7 shadow-md shadow-black/20">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center shadow-md shrink-0">
            <Lock className="w-5 h-5 text-cream-espresso" />
          </div>
          <div>
            <h2 className="font-serif text-2xl text-cream-text tracking-[-0.01em]">
              Sicurezza
            </h2>
            <p className="text-sm text-cream-text-soft font-light mt-1 max-w-md">
              Cambia la tua password. È richiesta la password attuale come conferma.
            </p>
          </div>
        </div>
        <PasswordForm email={dbUser.email} />
      </div>
    </div>
  );
}
