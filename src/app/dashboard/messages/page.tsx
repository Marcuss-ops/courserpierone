import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { ConversationList } from "./conversation-list";

/** Maximum chars to show for the last-message preview. */
const PREVIEW_MAX = 80;

export interface ConversationPreview {
  id: string;
  otherUser: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string; // ISO string from server→client serialization
    senderId: string;
    read: boolean;
  } | null;
  unreadCount: number;
}

export default async function MessagesPage() {
  const { user, dbUser } = await getServerUser();

  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  // Fetch all conversations where the user is a participant,
  // with the other user's info and the last message.
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ userOneId: dbUser.id }, { userTwoId: dbUser.id }],
    },
    include: {
      userOne: { select: { id: true, name: true, image: true, role: true } },
      userTwo: { select: { id: true, name: true, image: true, role: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, content: true, createdAt: true, senderId: true, read: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Compute unread counts in one batch query
  const conversationIds = conversations.map((c) => c.id);
  const unreadRows =
    conversationIds.length > 0
      ? await prisma.message.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: conversationIds },
            read: false,
            senderId: { not: dbUser.id },
          },
          _count: { id: true },
        })
      : [];

  const unreadMap = new Map<string, number>();
  for (const row of unreadRows) {
    unreadMap.set(row.conversationId, row._count.id);
  }

  // Build the preview list
  const previews: ConversationPreview[] = conversations.map((c) => {
    const otherUser = c.userOneId === dbUser.id ? c.userTwo : c.userOne;
    const lastMessage = c.messages[0] ?? null;

    return {
      id: c.id,
      otherUser,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content:
              lastMessage.content.length > PREVIEW_MAX
                ? lastMessage.content.slice(0, PREVIEW_MAX) + "…"
                : lastMessage.content,
            createdAt: lastMessage.createdAt.toISOString(),
            senderId: lastMessage.senderId,
            read: lastMessage.read,
          }
        : null,
      unreadCount: unreadMap.get(c.id) ?? 0,

    };
  });

  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased relative overflow-x-hidden">
      {/* Subtle warm glow overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(255, 200, 130, 0.04) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 bg-cream-dark-bg/80 backdrop-blur-xl border-b border-cream-dark-border">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2.5 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30 transition-all"
              aria-label="Torna alla dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="font-serif text-2xl text-cream-dark-text leading-tight">
                Messaggi
              </h1>
              <p className="text-xs text-cream-dark-text-soft font-light">
                {previews.length === 0
                  ? "Nessuna conversazione"
                  : `${previews.length} ${previews.length === 1 ? "conversazione" : "conversazioni"}`}
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="flex items-center gap-3 group"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-sm transition-all group-hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #444 100%)" }}
            >
              C
            </div>
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="relative max-w-4xl mx-auto px-6 py-8 lg:py-10 pb-24">
        {previews.length === 0 ? (
          /* Empty state */
          <div className="relative overflow-hidden bg-gradient-to-br from-cream-dark-bg via-cream-dark-surface to-cream-dark-surface border border-cream-dark-border rounded-[32px] p-12 lg:p-16 text-center shadow-2xl shadow-[#FF8C42]/15">
            <div
              className="absolute -top-20 -right-20 w-[360px] h-[360px] rounded-full pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(255, 140, 66, 0.25) 0%, transparent 65%)",
                filter: "blur(80px)",
              }}
              aria-hidden
            />
            <div className="relative max-w-md mx-auto space-y-6">
              <div className="w-20 h-20 rounded-3xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center mx-auto shadow-md">
                <Mail className="w-9 h-9 text-cream-dark-gold" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-3xl text-cream-dark-text">
                  Nessun messaggio
                </h3>
                <p className="text-cream-dark-text-soft text-sm font-light leading-relaxed">
                  Non hai ancora conversazioni attive. Quando uno studente ti scriverà
                  o inizierai una chat da un corso, apparirà qui.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-cream-dark-orange text-white px-6 py-3.5 rounded-xl text-sm font-semibold shadow-lg shadow-[#FF8C42]/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
              >
                Torna alla Dashboard <ArrowLeft className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <ConversationList previews={previews} currentUserId={dbUser.id} />
        )}
      </main>
    </div>
  );
}
