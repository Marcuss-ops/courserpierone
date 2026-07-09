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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3A2D1E] to-[#221A10] flex items-center justify-center shadow-md border border-cream-dark-border">
          <Award className="w-5 h-5 text-cream-dark-gold" />
        </div>
        <div>
          <h2 className="font-serif text-2xl text-cream-dark-text leading-tight">I Tuoi Certificati</h2>
          <p className="text-xs text-cream-dark-text-soft font-light">
            Scarica e condividi i tuoi traguardi
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {certificates.map((cert) => (
          <Link
            key={cert.productId}
            href={`/api/certificate/${cert.productId}`}
            className="group relative overflow-hidden bg-gradient-to-br from-cream-dark-surface to-cream-dark-surface border border-cream-dark-border rounded-2xl p-6 hover:border-cream-dark-gold/40 hover:shadow-lg hover:shadow-[#FF8C42]/10 hover:-translate-y-0.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-dark-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-dark-bg"
          >
            <div
              className="absolute -right-8 -top-8 w-32 h-32 rounded-full pointer-events-none"
              style={{
                background: "radial-gradient(circle, rgba(255, 140, 66, 0.35) 0%, transparent 70%)",
              }}
              aria-hidden
            />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cream-dark-bg border border-cream-dark-border flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                <Award className="w-5 h-5 text-cream-dark-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-cream-dark-text capitalize truncate">
                  {cert.slug.replace(/-/g, " ")}
                </h3>
                <p className="text-[10px] text-cream-dark-text-soft font-medium uppercase tracking-wider mt-1">
                  Certificato Disponibile
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-cream-dark-gold group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
