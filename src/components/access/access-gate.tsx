"use client";


interface AccessGateProps {
  children: React.ReactNode;
  productSlug: string;
  token?: string;
}

export function AccessGate({ children, productSlug, token }: AccessGateProps) {
  return <>{children}</>;
}
