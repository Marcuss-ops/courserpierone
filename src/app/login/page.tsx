"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get("productId");
  const callbackUrl = searchParams.get("callbackUrl");

  // Gestisci il redirect dopo auth callback (Google OAuth)
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        router.refresh();
        if (callbackUrl) {
          router.push(callbackUrl);
        } else if (productId) {
          router.push(`/${productId}/download?lang=it`);
        } else {
          router.push("/dashboard");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [callbackUrl, productId, router]);

  // Google OAuth via Supabase
  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${callbackUrl || (productId ? `/${productId}/download?lang=it` : "/dashboard")}`;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center font-bold text-2xl text-white shadow-sm">C</div>
            <span className="text-3xl font-black tracking-tighter text-gray-900 uppercase">Courssy.</span>
          </Link>
        </div>

        <div className="bg-white p-10 rounded-[2rem] border border-zinc-200/80 shadow-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Accedi</h1>
            <p className="text-zinc-500 text-sm mt-2 font-medium">
              {productId
                ? "Hai già acquistato? Accedi per vedere il corso."
                : "Accedi con il tuo account Google per continuare"}
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full py-4 bg-white rounded-2xl text-sm font-bold text-zinc-700 hover:text-zinc-900 transition flex items-center justify-center gap-3 border border-zinc-200 hover:bg-zinc-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continua con Google
          </button>

          <p className="mt-8 text-center text-[10px] text-zinc-400 font-medium">
            Non hai ancora acquistato?{" "}
            <Link href={productId ? `/${productId}` : "/"} className="text-accent-primary hover:underline">
              Scopri i nostri corsi
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
