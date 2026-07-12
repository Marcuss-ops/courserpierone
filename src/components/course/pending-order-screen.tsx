"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface PendingOrderScreenProps {
  orderId: string;
  locale?: string;
}

const TRANSLATIONS: Record<string, { title: string; description: string }> = {
  it: {
    title: "Verifica Ordine",
    description: "Stiamo confermando il tuo pagamento. Questo richiede pochi secondi.",
  },
  en: {
    title: "Order Verification",
    description: "We are confirming your payment. This takes a few seconds.",
  },
  es: {
    title: "Verificación del Pedido",
    description: "Estamos confirmando tu pago. Esto tarda unos segundos.",
  },
  fr: {
    title: "Vérification de la Commande",
    description: "Nous confirmons votre paiement. Cela prend quelques secondes.",
  },
  de: {
    title: "Bestellüberprüfung",
    description: "Wir bestätigen Ihre Zahlung. Dies dauert nur wenige Sekunden.",
  },
  pt: {
    title: "Verificação do Pedido",
    description: "Estamos confirmando seu pagamento. Isso leva alguns segundos.",
  },
};

export function PendingOrderScreen({ orderId, locale = "it" }: PendingOrderScreenProps) {
  const router = useRouter();
  const lang = locale.split("-")[0];
  const t = TRANSLATIONS[lang] ?? TRANSLATIONS.it;

  useEffect(() => {
    const timer = setTimeout(() => {
      router.refresh();
    }, 3000);
    return () => clearTimeout(timer);
  }, [router, orderId]);

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 font-sans flex items-center justify-center p-6 relative overflow-hidden">
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full blur-[120px] -z-10 opacity-20"
        style={{ backgroundColor: "#C9840D" }}
      />
      <div className="max-w-md w-full text-center space-y-8 relative z-10">
        <div className="w-20 h-20 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-[#C9840D] animate-spin" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
            {t.title}
          </h1>
          <p className="text-zinc-400 text-sm md:text-base font-medium leading-relaxed">
            {t.description}
          </p>
        </div>
      </div>
    </div>
  );
}
