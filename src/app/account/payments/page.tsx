import { redirect } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { CreditCard, Receipt } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Storico Pagamenti" };

/**
 * /account/payments — lista TUTTI gli ordini dell'utente autenticato
 * (status completed/refunded/pending/failed), ordinati per data disc.
 * joined con Product per mostrare il titolo del corso acquistato.
 *
 * Server-rendered: nessun hook di mutazione, nessuno stato client.
 * Currency è memorizzata su Order (vedi schema.prisma Order.currency).
 */
const STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  completed: { label: "Completato", badge: "bg-emerald-500/20 text-emerald-100 border-emerald-400/40" },
  pending: { label: "In attesa", badge: "bg-amber-500/20 text-amber-100 border-amber-400/40" },
  failed: { label: "Fallito", badge: "bg-red-500/20 text-red-100 border-red-400/40" },
  refunded: { label: "Rimborsato", badge: "bg-zinc-500/30 text-zinc-100 border-zinc-400/40" },
};

function formatAmount(cents: number, currency: string): string {
  const eur = cents / 100;
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(eur);
  } catch {
    return `${eur.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function PaymentsPage() {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) redirect("/login");

  const orders = await prisma.order.findMany({
    where: { userId: dbUser.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      createdAt: true,
      paymentProvider: true,
      providerOrderId: true,
      product: { select: { id: true, slug: true, coverUrl: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-2">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center shadow-md shrink-0">
          <Receipt className="w-5 h-5 text-cream-espresso" />
        </div>
        <div>
          <h2 className="font-serif text-2xl text-cream-text tracking-[-0.01em]">
            Storico pagamenti
          </h2>
          <p className="text-sm text-cream-text-soft font-light mt-1 max-w-md">
            Tutti i tuoi acquisti. Gli importi sono in {orders[0]?.currency.toUpperCase() ?? "EUR"}.
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-cream-card border border-cream-border rounded-[28px] p-12 shadow-md shadow-black/20 text-center">
          <div className="w-14 h-14 rounded-full bg-cream-border-soft flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-6 h-6 text-cream-text-soft" />
          </div>
          <p className="text-sm text-cream-text-soft font-light">
            Nessun pagamento ancora.
          </p>
          <p className="text-xs text-cream-text-soft/70 mt-1">
            I tuoi acquisti compariranno qui automaticamente.
          </p>
        </div>
      ) : (
        <div className="bg-cream-card border border-cream-border rounded-[28px] shadow-md shadow-black/20 overflow-hidden">
          <table className="w-full">
            <thead className="bg-cream-border-soft/60 border-b border-cream-border">
              <tr className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest">
                <th className="text-left px-5 py-3.5">Prodotto</th>
                <th className="text-left px-3 py-3.5 hidden sm:table-cell">Provider</th>
                <th className="text-right px-3 py-3.5">Importo</th>
                <th className="text-center px-3 py-3.5">Stato</th>
                <th className="text-right px-5 py-3.5 hidden md:table-cell">Data</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const sl = STATUS_LABELS[o.status] ?? {
                  label: o.status,
                  badge: "bg-zinc-500/30 text-zinc-100 border-zinc-400/40",
                };
                return (
                  <tr
                    key={o.id}
                    className="border-b border-cream-border-soft last:border-b-0 hover:bg-cream-border-soft/40 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {o.product.coverUrl ? (
                          <Image
                            src={o.product.coverUrl}
                            alt=""
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-lg object-cover border border-cream-border shrink-0"
                            unoptimized
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-cream-border flex items-center justify-center shrink-0 font-serif text-cream-text-soft">
                            {o.product.slug[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-cream-text truncate max-w-[200px] sm:max-w-xs">
                          {o.product.slug}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-[12px] text-cream-text-soft hidden sm:table-cell">
                      {o.paymentProvider}
                    </td>
                    <td className="px-3 py-4 text-right text-sm font-mono tabular-nums text-cream-text">
                      {formatAmount(o.amount, o.currency)}
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${sl.badge}`}
                      >
                        {sl.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-[11px] text-cream-text-soft hidden md:table-cell">
                      {formatDate(o.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
