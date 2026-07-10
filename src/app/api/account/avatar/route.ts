import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

/** Allowed MIME types for avatars. */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Max avatar file size: 2 MB. */
const MAX_SIZE = 2 * 1024 * 1024;

/**
 * POST /api/account/avatar
 *
 * Generates a presigned upload URL for the authenticated user's avatar.
 * The client uploads directly to Supabase Storage, then calls PATCH to
 * confirm and save the URL.
 *
 * Body: { fileName: string, contentType: string, fileSize: number }
 *
 * Returns: { uploadUrl, path, token } — the client uploads to uploadUrl
 * with a PUT request (Content-Type: contentType, Content-Length: fileSize).
 */
export const POST = withRateLimit(async function POST(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // Parse and validate body
    let body: { fileName?: string; contentType?: string; fileSize?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const { fileName, contentType, fileSize } = body;

    if (!fileName || !contentType || fileSize == null) {
      return NextResponse.json(
        { error: "fileName, contentType e fileSize sono obbligatori" },
        { status: 400 },
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: `Tipo file non supportato. Usa: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    // Validate file size
    if (fileSize > MAX_SIZE) {
      return NextResponse.json(
        { error: `File troppo grande. Massimo ${MAX_SIZE / 1024 / 1024} MB` },
        { status: 400 },
      );
    }

    // Sanitize filename: remove path separators, keep extension
    const ext = fileName.split(".").pop()?.toLowerCase() || "jpg";
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
      return NextResponse.json(
        { error: "Estensione file non valida. Usa: jpg, png, webp" },
        { status: 400 },
      );
    }

    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    // Path: {userId}/avatars/{timestamp}-{filename}
    const path = `${dbUser.id}/avatars/${timestamp}-${sanitized}`;

    // Generate presigned upload URL via Supabase admin client
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Storage non configurato" },
        { status: 500 },
      );
    }

    const { data, error } = await supabase.storage
      .from("user_uploads")
      .createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      console.error("[avatar] Failed to create signed URL:", error);
      return NextResponse.json(
        { error: "Errore nella generazione dell'URL di upload" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      path,
      token: data.token,
    });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "AUTH");

/**
 * PATCH /api/account/avatar
 *
 * Confirms the avatar upload by saving the public URL to the user's profile.
 * Called after the client successfully uploads the file to Supabase.
 *
 * Body: { path: string } — the storage path returned by POST.
 *
 * Returns: { avatarUrl } — the public URL of the uploaded avatar.
 */
export const PATCH = withRateLimit(async function PATCH(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    let body: { path?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const { path } = body;

    if (!path || typeof path !== "string") {
      return NextResponse.json(
        { error: "path è obbligatorio" },
        { status: 400 },
      );
    }

    // Security: verify the path belongs to the authenticated user
    if (!path.startsWith(`${dbUser.id}/`)) {
      return NextResponse.json(
        { error: "Accesso negato — il path non appartiene al tuo account" },
        { status: 403 },
      );
    }

    // Generate a signed URL (bucket is private — getPublicUrl won't work).
    // 1 year expiry for avatars (31536000 seconds).
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Storage non configurato" },
        { status: 500 },
      );
    }

    const ONE_YEAR = 31536000;
    const { data: signedData, error: signedError } = await supabase.storage
      .from("user_uploads")
      .createSignedUrl(path, ONE_YEAR);

    if (signedError || !signedData?.signedUrl) {
      console.error("[avatar] Failed to create signed URL:", signedError);
      return NextResponse.json(
        { error: "Errore nella generazione dell'URL pubblico" },
        { status: 500 },
      );
    }

    const avatarUrl = signedData.signedUrl;

    // Save the avatar URL to the user's profile
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { image: avatarUrl },
    });

    return NextResponse.json({ avatarUrl });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "AUTH");
