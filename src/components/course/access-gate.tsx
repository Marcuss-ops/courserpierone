"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Lock, Play, ArrowRight, Eye, ShieldAlert, Sparkles } from "lucide-react";

interface AccessGateProps {
  productSlug: string;
  courseTitle: string;
  children: React.ReactNode;
}

export function AccessGate({ productSlug, courseTitle, children }: AccessGateProps) {
  return <>{children}</>;
}
