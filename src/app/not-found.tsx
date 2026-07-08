import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen text-black font-sans flex items-center justify-center p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #FFF8F0 0%, #FFF5E6 30%, #FAFAF8 70%, #F5F0E8 100%)" }}>
      {/* Warm accent orb */}
      <div className="fixed w-[500px] h-[500px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255, 200, 130, 0.25) 0%, transparent 70%)", bottom: "-150px", left: "-150px", filter: "blur(80px)" }} />

      <div className="relative p-10 rounded-3xl text-center max-w-md space-y-6" style={{ background: "linear-gradient(180deg, #FFFDF9 0%, #FFF9F0 100%)", border: "1px solid rgba(200, 180, 150, 0.25)" }}>
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto font-bold text-2xl text-white shadow-md"
          style={{ background: "linear-gradient(135deg, #2a1800 0%, #5a3510 100%)" }}
        >
          404
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-black">Pagina non trovata</h2>
        <p className="text-[14px] text-black/45 font-light">
          La pagina che stai cercando non esiste o è stata spostata.
        </p>
        <Link
          href="/"
          className="inline-block w-full py-3.5 text-white rounded-xl text-[14px] font-semibold shadow-md hover:shadow-lg hover:brightness-110 transition-all"
          style={{ background: "linear-gradient(135deg, #2a1800 0%, #5a3510 100%)" }}
        >
          Torna alla Home
        </Link>
      </div>
    </div>
  );
}
