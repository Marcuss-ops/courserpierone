"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useChatT } from "@/lib/i18n/use-chat-t";

interface MessageProfileButtonProps {
  otherUserId: string;
  otherUserName: string;
}

export function MessageProfileButton({
  otherUserId,
  otherUserName,
}: MessageProfileButtonProps) {
  const t = useChatT();
  return (
    <Link
      href={`/dashboard/messages/${otherUserId}`}
      className="inline-flex items-center gap-2 px-4 py-2.5 bg-cream-dark-gold/10 border border-cream-dark-gold/20 rounded-xl text-xs font-semibold text-cream-dark-gold hover:bg-cream-dark-gold/20 hover:-translate-y-0.5 transition-all"
      title={t.messageTitle.replace("{name}", otherUserName)}
    >
      <MessageSquare className="w-4 h-4" />
      <span className="hidden sm:inline">{t.messageLabel}</span>
    </Link>
  );
}
