"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAuthTranslations } from "@/lib/i18n/auth-translations";

type AuthMode = "login" | "signup";

interface AuthFormProps {
  lang: string;
}

function isSafeCallbackUrl(url: string): boolean {
  // Only allow relative paths starting with a single slash to prevent
  // open-redirect attacks to external domains.
  return url.startsWith("/") && !url.startsWith("//");
}

export function AuthForm({ lang }: AuthFormProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get("productId");
  const callbackUrl = searchParams.get("callbackUrl");
  const oauthErrorParam = searchParams.get("oauth_error");
  const oauthCodeParam = searchParams.get("oauth_code");

  const t = getAuthTranslations(lang);

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [oauthDetail, setOauthDetail] = useState("");
  const [success, setSuccess] = useState("");

  // Show OAuth error from URL fragment or query param on mount
  useEffect(() => {
    const fragment = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const fragmentParams = new URLSearchParams(fragment);
    const hashError =
      fragmentParams.get("error_description") ||
      fragmentParams.get("error");
    const hashErrorCode = fragmentParams.get("error_code");

    const oauthReason = hashError || oauthErrorParam;
    if (oauthReason) {
      const decoded = decodeURIComponent(oauthReason);
      const codeSuffix =
        hashErrorCode || oauthCodeParam
          ? ` (${hashErrorCode || oauthCodeParam})`
          : "";
      setError(t.oauthError);
      setOauthDetail(`${t.oauthErrorDetail}: ${decoded}${codeSuffix}\n${t.oauthErrorHint}`);
      // Clean both fragment and query params so refresh doesn't reprocess
      const cleanUrl =
        window.location.pathname +
        window.location.search
          .replace(/[?&]oauth_error=[^&]*/g, "")
          .replace(/[?&]oauth_code=[^&]*/g, "")
          .replace(/[?&]$/, "");
      window.history.replaceState(null, "", cleanUrl);
    }
    // t.* intentionally omitted: this is a one-shot error display set on mount.
    // Re-running on language change would replace a meaningful error with a stale one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decodedCallbackUrl = callbackUrl ? decodeURIComponent(callbackUrl) : null;

  const redirectTarget = decodedCallbackUrl && isSafeCallbackUrl(decodedCallbackUrl)
    ? decodedCallbackUrl
    : productId
      ? `/${lang}/${productId}/download`
      : "/dashboard";

  // Handle redirect after auth
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        router.refresh();
        router.push(redirectTarget);
      }
    });
    return () => subscription.unsubscribe();
  }, [redirectTarget, router]);

  // Email + password sign in
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOauthDetail("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? t.invalidCredentials
            : authError.message
        );
      }
    } catch {
      setError(t.genericError);
    } finally {
      setLoading(false);
    }
  };

  // Email + password sign up
  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOauthDetail("");
    setSuccess("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTarget)}`,
        },
      });
      if (authError) {
        setError(authError.message);
      } else {
        setSuccess(t.checkEmail);
      }
    } catch {
      setError(t.genericError);
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth
  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTarget)}`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  };

  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen text-black font-sans flex items-center justify-center p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #FFF8F0 0%, #FFF5E6 30%, #FAFAF8 70%, #F5F0E8 100%)" }}>
      {/* Warm accent orb top-right */}
      <div
        className="fixed w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255, 200, 130, 0.35) 0%, rgba(255, 170, 80, 0.15) 40%, transparent 70%)",
          top: "-200px",
          right: "-200px",
          filter: "blur(80px)",
        }}
      />
      {/* Warm accent orb bottom-left */}
      <div
        className="fixed w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255, 180, 100, 0.2) 0%, rgba(255, 140, 60, 0.1) 40%, transparent 70%)",
          bottom: "-150px",
          left: "-150px",
          filter: "blur(100px)",
        }}
      />
      {/* Soft violet accent orb */}
      <div
        className="fixed w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(200, 170, 255, 0.15) 0%, transparent 70%)",
          top: "50%",
          left: "60%",
          filter: "blur(80px)",
        }}
      />

      <div className="relative w-full max-w-[420px]">
        {/* Brand */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-block group">
            <span className="font-serif italic text-[38px] leading-none tracking-[-0.3px] group-hover:opacity-60 transition-opacity">
              courssy
            </span>
          </Link>
        </div>

        {/* Card — warm cream */}
        <div className="p-8 rounded-3xl shadow-lg shadow-black/[0.04]" style={{ background: "linear-gradient(180deg, #FFFDF9 0%, #FFF9F0 100%)", border: "1px solid rgba(200, 180, 150, 0.25)" }}>
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-[20px] font-semibold tracking-tight text-black">
              {isSignup ? t.signupTitle : t.loginTitle}
            </h1>
            <p className="text-[13px] text-black/45 mt-1.5 font-light">
              {isSignup ? t.signupSubtitle : t.loginSubtitle}
            </p>
          </div>

          {/* Error / Success messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-600">
              <p className="font-medium">{error}</p>
              {oauthDetail && (
                <p className="mt-1.5 text-[12px] text-red-500/80 whitespace-pre-line leading-relaxed">
                  {oauthDetail}
                </p>
              )}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-xl text-[13px] text-green-700">
              {success}
            </div>
          )}

          {/* Google OAuth button */}
          <button
            onClick={handleGoogleLogin}
            className="w-full py-3.5 rounded-xl text-[14px] font-medium text-black/70 hover:text-black transition-all flex items-center justify-center gap-3 hover:shadow-sm mb-5" style={{ background: "#FFFFFF", border: "1px solid rgba(200, 180, 150, 0.3)" }}
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {t.continueWithGoogle}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-1 h-px bg-black/[0.06]" />
            <span className="text-[11px] text-black/30 font-medium uppercase tracking-wider">
              {t.or}
            </span>
            <div className="flex-1 h-px bg-black/[0.06]" />
          </div>

          {/* Email/password form */}
          <form
            onSubmit={isSignup ? handleEmailSignup : handleEmailLogin}
            className="space-y-3"
          >
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-black/25 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.email}
                required
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3.5 rounded-xl text-[14px] font-light text-black placeholder:text-black/30 focus:outline-none focus:ring-2 transition-all" style={{ background: "#FFFCF7", border: "1px solid rgba(200, 180, 150, 0.25)", "--tw-ring-color": "rgba(200, 160, 80, 0.2)" } as React.CSSProperties}
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-black/25 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.password}
                required
                minLength={6}
                autoComplete={isSignup ? "new-password" : "current-password"}
                className="w-full pl-10 pr-10 py-3.5 rounded-xl text-[14px] font-light text-black placeholder:text-black/30 focus:outline-none focus:ring-2 transition-all" style={{ background: "#FFFCF7", border: "1px solid rgba(200, 180, 150, 0.25)", "--tw-ring-color": "rgba(200, 160, 80, 0.2)" } as React.CSSProperties}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 text-white rounded-xl text-[14px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2 shadow-md hover:shadow-lg hover:brightness-110" style={{ background: "linear-gradient(135deg, #2a1800 0%, #5a3510 100%)" }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {isSignup ? t.signup : t.login}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle login/signup */}
          <p className="mt-6 text-center text-[13px] text-black/40 font-light">
            {isSignup ? t.hasAccount : t.noAccount}{" "}
            <button
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setError("");
                setSuccess("");
              }}
              className="font-semibold hover:underline underline-offset-2 transition-colors" style={{ color: "#8B6914" }}
            >
              {isSignup ? t.login : t.register}
            </button>
          </p>
        </div>

        {/* Back link */}
        <p className="mt-6 text-center text-[13px] text-black/40 font-light">
          <Link href="/" className="hover:text-black/60 transition-colors">
            ← {t.backToHome}
          </Link>
        </p>
      </div>
    </div>
  );
}
