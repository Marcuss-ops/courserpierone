import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

/**
 * GET /api/users/search-customers?q=<query>&limit=10
 *
 * Fase 2.4 del piano DMs — endpoint ristretto per il CREATOR.
 *
 * Restituisce SOLO i clienti (User) che hanno almeno un `Order.status
 * = "completed"` su QUALSIASI prodotto del `currentUser` autenticato
 * (i.e. `Product.creatorId === currentUser.id`). É la single source
 * of truth per chi può essere contattato come cliente di un creator.
 *
 * Differenze rispetto al legacy `/api/users/search` (rimosso in Fase
 * 2.4, vedi commit `d4965a2` + questo):
 * - Niente più "trova Mario23 a caso": ogni risultato è vincolato a
 *   un ordine completed verso un mio prodotto.
 * - Auto-esclusione del proprio user-id (anche se un creator
 *   comprasse un suo corso, non compare nei suoi stessi risultati).
 *
 * NOTA — gestione asimmetrica dei ruoli (decisione V1):
 * - Questo endpoint NON filtra ulteriormente per role: qualsiasi
 *   User che abbia un Order.completed verso un mio prodotto viene
 *   mostrato, inclusi creator/admin che hanno comprato corsi da me.
 *   Questa è la semantica "customer = anyone who paid me" desiderata
 *   in V1 (un creator che compra da un altro creator E un contatto
 *   di business che gli ha scritto il thread, ha senso che risulti).
 * - Per simmetria con `search-creators`, in una V2 si potrebbe
 *   restringere a `role: 'student'`, ma servirebbe product input
 *   (consentirebbe solo i clienti NON-creator per quel product).
 *   Deciso di lasciare aperto in V1 per privilegiare lo scope
 *   semantico puro (chiunque abbia pagato) sopra la segmentazione
 *   per ruolo.
 *
 * Vincoli mantenuti dal legacy:
 * - Auth required (401).
 * - `q` minimo 2 chars.
 * - `limit` capped a 20 (default 10).
 * - Solo campi pubblici nella response (no email/hashedPassword).
 *
 * Rate-limit tier `AUTH` (10 req/60s) per utente — un creator che
 * cerca clienti lo fa per un'azione specifica, non in loop.
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 20);

    if (q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // ── Single query con sub-filter Prisma `some` nested ─────
    // La relation `User.orders` è in join con `Order.userId`. Il
    // filtro `orders.some.status = "completed"` + `product.creatorId
    // = self.id` risolve in UN solo round-trip e garantisce che
    // risultati vuoti (no ordini completed verso i miei prodotti)
    // siano gestiti naturalmente senza logica applicativa extra.
    const users = await prisma.user.findMany({
      where: {
        id: { not: dbUser.id }, // exclude self
        orders: {
          some: {
            status: "completed",
            product: {
              creatorId: dbUser.id,
            },
          },
        },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
          { email: { startsWith: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        role: true,
        bio: true,
      },
      orderBy: { name: "asc" },
      take: limit,
    });

    return NextResponse.json({ users });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "AUTH");
