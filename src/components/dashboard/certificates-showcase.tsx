import Link from "next/link";
import { Award, ArrowRight } from "lucide-react";

interface CertificatesShowcaseProps {
  certificates: { productId: string; slug: string }[];
}

export function CertificatesShowcase({ certificates }: CertificatesShowcaseProps) {
  if (certificates.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center shadow-sm">
          <Award className="w-5 h-5 text-cream-gold" />
        </div>
        <div>
          <h2 className="font-serif text-2xl text-cream-text leading-tight">I Tuoi Certificati</h2>
          <p className="text-xs text-cream-text-soft font-light">
            Scarica e condividi i tuoi traguardi
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {certificates.map((cert) => (
          <Link
            key={cert.productId}
            href={`/api/certificate/${cert.productId}`}
            className="group relative overflow-hidden bg-gradient-to-br from-[#FFFDF9] to-[#FFF5E6] border border-cream-border rounded-2xl p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-bg"
          >
            <div
              className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none"
              style={{
                background: "radial-gradient(circle, rgba(255, 200, 130, 0.4) 0%, transparent 70%)",
              }}
              aria-hidden
            />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cream-card border border-cream-border flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <Award className="w-5 h-5 text-cream-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-cream-text capitalize truncate">
                  {cert.slug.replace(/-/g, " ")}
                </h3>
                <p className="text-[10px] text-cream-text-soft font-medium uppercase tracking-wider mt-1">
                  Certificato Disponibile
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-cream-gold group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
