"use client";


interface AccessGateProps {
  children: React.ReactNode;
  productSlug: string;
  token?: string;
}

export function AccessGate({ children, productSlug: _productSlug, token: _token }: AccessGateProps) {
  return <>{children}</>;
}
