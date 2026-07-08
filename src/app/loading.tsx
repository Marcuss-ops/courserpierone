export default function LoadingPage() {
  return (
    <div className="min-h-screen text-black font-sans flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #FFF8F0 0%, #FFF5E6 30%, #FAFAF8 70%, #F5F0E8 100%)" }}>
      <div className="flex flex-col items-center gap-5">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-lg text-white shadow-md"
          style={{ background: "linear-gradient(135deg, #2a1800 0%, #5a3510 100%)" }}
        >
          C
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-black/20 animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-black/20 animate-pulse" style={{ animationDelay: "0.2s" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-black/20 animate-pulse" style={{ animationDelay: "0.4s" }} />
        </div>
      </div>
    </div>
  );
}
