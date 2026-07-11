"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLogError } from "@/lib/logging/use-log-error";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  useLogError(error, pathname);
  return (
    <div className="min-h-screen text-black font-sans flex items-center justify-center p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #FFF8F0 0%, #FFF5E6 30%, #FAFAF8 70%, #F5F0E8 100%)" }}>
      {/* Warm accent orb */}
      <div className="fixed w-[500px] h-[500px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255, 200, 130, 0.25) 0%, transparent 70%)", top: "-150px", right: "-150px", filter: "blur(80px)" }} />

      <div className="relative p-10 rounded-3xl text-center max-w-md space-y-6" style={{ background: "linear-gradient(180deg, #FFFDF9 0%, #FFF9F0 100%)", border: "1px solid rgba(200, 180, 150, 0.25)" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: "rgba(220, 60, 60, 0.08)", border: "1px solid rgba(220, 60, 60, 0.15)" }}>
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-black">Qualcosa è andato storto</h2>
        <p className="text-[14px] text-black/45 font-light">
          Si è verificato un errore imprevisto. Riprova tra qualche istante.
        </p>
        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={reset}
            className="w-full py-3.5 text-white rounded-xl text-[14px] font-semibold shadow-md hover:shadow-lg hover:brightness-110 transition-all"
            style={{ background: "linear-gradient(135deg, #2a1800 0%, #5a3510 100%)" }}
          >
            Riprova
          </button>
          <Link
            href="/"
            className="w-full py-3.5 rounded-xl text-[14px] font-medium text-black/60 hover:text-black transition-all"
            style={{ border: "1px solid rgba(200, 180, 150, 0.25)", background: "#FFFCF7" }}
          >
            Torna alla Home
          </Link>
        </div>
        {error.digest && (
          <p className="text-[10px] text-black/20 font-mono pt-2">
            {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
