import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

/**
 * GET /api/users/search-creators?q=<query>&limit=10
 *
 * Fase 2.4 del piano DMs — endpoint ristretto per lo STUDENTE.
 *
 * Restituisce SOLO i creator (User.role IN ['creator', 'admin'])
 * che hanno almeno un PRODOTTO acquistato dal `currentUser` con
 * `Order.status = "completed"`. In altre parole: i creator dei
 * corsi che lo studente possiede effettivamente.
 *
 * Differenze rispetto al legacy `/api/users/search` (rimosso in
 * Fase 2.4): uno studente non può più cercare TUTTI gli utenti della
 * piattaforma — solo i creator che gli hanno venduto un corso. É la
 * single source of truth per chi può essere contattato come creator
 * dal lato studente.
 *
 * Vincoli mantenuti dal legacy:
 * - Auth required (401).
 * - `q` minimo 2 chars.
 * - `limit` capped a 20 (default 10).
 * - Solo campi pubblici nella response.
 *
 * Edge case — Product.creatorId NULLABLE (V1, vedi schema Phase
 * 1.2): i prodotti "orfani" senza creator non hanno mai un creator
 * che li possiede, quindi NON matchano la sub-query `createdProducts.
 * some`. Esclusione IMPLICITA senza logica applicativa.
 *
 * Edge case — User.role può cambiare nel tempo:
 * - `role: { in: ['creator', 'admin'] }` è la restrizione difensiva
 *   contro uno studente che ha prodotti legacy (es. migration V1).
 *   Se in futuro promuoviamo uno studente a creator, dobbiamo
 *   aggiornare User.role per farlo comparire nei risultati di
 *   search-creators degli studenti che hanno comprato i suoi prodotti.
 * - Admin incluso in `role: { in: ['creator', 'admin'] }` per
 *   coerenza con il modello (un admin con prodotti funziona come
 *   un creator per gli studenti).
 *
 * Rate-limit tier `AUTH` (10 req/60s) per utente — un cliente che
 * cerca creator lo fa per un'azione specifica, non in loop.
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
    // La relation `User.createdProducts` è in join con `Product.
    // creatorId`. Filtriamo sui prodotti di cui il creator è owner
    // E che hanno ordini completed dal currentUser. Risolve in UN
    // solo round-trip.
    const users = await prisma.user.findMany({
      where: {
        id: { not: dbUser.id }, // exclude self
        role: { in: ["creator", "admin"] }, // solo creator (admin incluso per flessibilità futura)
        createdProducts: {
          some: {
            orders: {
              some: {
                userId: dbUser.id,
                status: "completed",
              },
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
