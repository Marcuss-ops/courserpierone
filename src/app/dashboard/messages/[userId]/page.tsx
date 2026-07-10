import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { ChatView } from "./chat-view";

interface ChatPageProps {
  params: Promise<{ userId: string }>;
}

export default async function ConversationPage({ params }: ChatPageProps) {
  const { userId } = await params;
  const { user, dbUser } = await getServerUser();

  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  // Fetch the other user
  const otherUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, image: true, role: true },
  });

  if (!otherUser) {
    return (
      <div className="min-h-screen bg-cream-dark-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-cream-dark-text-soft text-lg">Utente non trovato</p>
          <Link
            href="/dashboard/messages"
            className="inline-flex items-center gap-2 text-sm text-cream-dark-gold hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Torna ai messaggi
          </Link>
        </div>
      </div>
    );
  }

  // Verify a conversation exists between the two users (or create one lazily — the chat view handles it)
  const [minId, maxId] = [dbUser.id, otherUser.id].sort();
  const conversation = await prisma.conversation.findUnique({
    where: { userOneId_userTwoId: { userOneId: minId, userTwoId: maxId } },
    select: { id: true },
  });

  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased flex flex-col">
      {/* Subtle glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(255, 200, 130, 0.04) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-cream-dark-bg/80 backdrop-blur-xl border-b border-cream-dark-border shrink-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link
            href="/dashboard/messages"
            className="p-2 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30 transition-all shrink-0"
            aria-label="Torna ai messaggi"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden shrink-0 shadow-sm ring-1 ring-cream-dark-border">
              {otherUser.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={otherUser.image}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-cream-gold text-sm font-bold">
                  {(otherUser.name || "U")[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm text-cream-dark-text truncate">
                {otherUser.name || "Utente"}
              </h2>
              <p className="text-[10px] text-cream-dark-text-soft">
                {otherUser.role === "admin" ? "Creator" : "Studente"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <ChatView
        conversationId={conversation?.id ?? null}
        currentUserId={dbUser.id}
        currentUserName={dbUser.name || dbUser.email?.split("@")[0] || "Tu"}
        otherUser={otherUser}
      />
    </div>
  );
}
