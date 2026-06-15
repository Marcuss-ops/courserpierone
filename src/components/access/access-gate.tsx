"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, ArrowLeft } from "lucide-react";

interface AccessGateProps {
  children: React.ReactNode;
  productSlug: string;
  token?: string;
}

export function AccessGate({ children, productSlug, token }: AccessGateProps) {
  return <>{children}</>;
}
