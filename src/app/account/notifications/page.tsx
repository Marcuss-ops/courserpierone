import { getServerUser } from "@/lib/supabase/get-user";
import { prisma } from "@/lib/db/prisma";
import { Bell } from "lucide-react";
import { PreferencesForm } from "./preferences-form";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preferenze Notifiche" };

/**
 * /account/notifications — gestione delle NotificationPreference utente.
 *
 * V1 le categorie sono:
 *   - inappChatReply       (campanella per nuovi messaggi chat)
 *   - inappNewLesson       (campanella per lezioni/corso aggiunti)
 *   - inappCommunityReply  (campanella per risposte community; V2)
 *   - emailNewLesson       (email per lezioni/corso aggiunti)
 *   - emailCommunityReply  (email per risposte community; V2)
 *
 * Se la riga NotificationPreference non esiste, ne creiamo una con
 * default all-on (idempotent via Prisma upsert).
 */
export default async function NotificationsPrefPage() {
  const { dbUser } = await getServerUser();
  if (!dbUser) return null;

  // Get-or-create preferences row (idempotente).
  const pref = await prisma.notificationPreference.upsert({
    where: { userId: dbUser.id },
    create: { userId: dbUser.id },
    update: {}, // niente update se esiste già
    select: {
      emailNewLesson: true,
      emailCommunityReply: true,
      inappChatReply: true,
      inappNewLesson: true,
      inappCommunityReply: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-2">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center shadow-md shrink-0">
          <Bell className="w-5 h-5 text-cream-espresso" />
        </div>
        <div>
          <h2 className="font-serif text-2xl text-cream-text tracking-[-0.01em]">
            Notifiche
          </h2>
          <p className="text-sm text-cream-text-soft font-light mt-1 max-w-md">
            Scegli come vuoi essere avvisato per ogni categoria. La
            campanella in alto a destra resta sempre accessibile.
          </p>
        </div>
      </div>

      <PreferencesForm initial={pref} />
    </div>
  );
}
