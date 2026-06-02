import Link from "next/link";

export default function DemoIndex() {
  const demos = [
    {
      id: "lumio",
      name: "Lumio",
      description: "Minimalismo + Glassmorphism, tonalità calda ivory, gradienti sunset",
      color: "#FAF9F5",
      accent: "#FF416C",
      emoji: "☀️",
    },
    {
      id: "h612",
      name: "Obsidian Scholar",
      description: "Dark monochrome, tonal layering, serif + sans, liquid orbs",
      color: "#141313",
      accent: "#4facfe",
      emoji: "🌑",
    },
    {
      id: "horizon",
      name: "Horizon",
      description: "Airy minimalism, glassmorphism, gradienti atmosferici, cursor glow",
      color: "#fff9ee",
      accent: "#FF5E3A",
      emoji: "🌅",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Demo Templates</h1>
          <p className="mt-3 text-gray-500">
            3 demo template — solo testo, zero immagini
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {demos.map((demo) => (
            <Link
              key={demo.id}
              href={`/demo/${demo.id}`}
              className="group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              {/* Preview */}
              <div
                className="flex h-48 items-center justify-center transition group-hover:scale-105"
                style={{ background: demo.color }}
              >
                <span className="text-5xl">{demo.emoji}</span>
              </div>
              {/* Info */}
              <div className="p-5">
                <h2 className="font-bold">{demo.name}</h2>
                <p className="mt-1 text-sm text-gray-500">{demo.description}</p>
                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-900">
                  Vedi Demo
                  <span className="transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link href="/admin" className="text-sm text-gray-500 underline hover:text-gray-900">
            ← Torna alla Dashboard Admin
          </Link>
        </div>
      </div>
    </div>
  );
}
