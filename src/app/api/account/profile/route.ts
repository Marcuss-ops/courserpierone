import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";
import { z } from "zod";

const MAX_NAME_LENGTH = 60;
const MAX_BIO_LENGTH = 500;
const MAX_USERNAME_LENGTH = 30;
const VALID_SOCIAL_PLATFORMS = ["twitter", "instagram", "youtube", "linkedin", "website"] as const;

const usernameRegex = /^[a-zA-Z0-9_-]+$/;

const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  username: z
    .string()
    .trim()
    .min(3, "Username deve avere almeno 3 caratteri")
    .max(MAX_USERNAME_LENGTH)
    .regex(usernameRegex, "Username può contenere solo lettere, numeri, trattini e underscore")
    .optional(),
  bio: z.string().trim().max(MAX_BIO_LENGTH).optional().nullable(),
  coverImageUrl: z.string().url("URL copertina non valido").optional().nullable(),
  socialLinks: z
    .record(
      z.enum(VALID_SOCIAL_PLATFORMS),
      z.string().url("URL social non valido")
    )
    .optional()
    .nullable(),
});

/**
 * PATCH /api/account/profile
 *
 * Updates the authenticated user's profile fields:
 * name, username, bio, coverImageUrl, socialLinks.
 * Email is intentionally NOT editable here (would require a verification flow).
 *
 * Returns: 200 { success: true, profile } | 400 { error } | 401 { error } | 409 { error: username taken }
 */
export const PATCH = withRateLimit(async function PATCH(request: NextRequest) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return NextResponse.json(
      { error: "Validazione fallita", details: errors },
      { status: 400 }
    );
  }

  const { name, username, bio, coverImageUrl, socialLinks } = parsed.data;

  // Se non c'è nulla da aggiornare
  if (!name && !username && bio === undefined && coverImageUrl === undefined && socialLinks === undefined) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
  }

  // Se username è fornito, verifica che non sia già in uso da un altro utente
  if (username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== dbUser.id) {
      return NextResponse.json(
        { error: "Username già in uso" },
        { status: 409 }
      );
    }
  }

  try {
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (username !== undefined) data.username = username;
    if (bio !== undefined) data.bio = bio;
    if (coverImageUrl !== undefined) data.coverImageUrl = coverImageUrl;
    if (socialLinks !== undefined) {
      data.socialLinks = socialLinks ? JSON.stringify(socialLinks) : null;
    }

    const updated = await prisma.user.update({
      where: { id: dbUser.id },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        image: true,
        coverImageUrl: true,
        socialLinks: true,
        role: true,
      },
    });

    return NextResponse.json({
      success: true,
      profile: {
        ...updated,
        socialLinks: updated.socialLinks ? JSON.parse(updated.socialLinks) : null,
      },
    });    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ error: "Username già in uso" }, { status: 409 });
      }
      return apiErrorResponse(err, "Errore interno, riprova");
    }
}, "AUTH");
