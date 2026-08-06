import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { apiErrorResponse } from "@/lib/errors";
import { requireAdmin } from "@/domains/identity";
import { getUploadMaxBytes } from "@/lib/env";
import { withRateLimit } from "@/lib/utils/rate-limit";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "video/mp4",
];
const MAX_UPLOAD_BYTES = getUploadMaxBytes(); // typed number, default 10 MB (override via UPLOAD_MAX_BYTES env).
const BUCKET_NAME = "covers";

export const POST = withRateLimit(async function POST(request: NextRequest) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nessun file inviato" }, { status: 400 });
    }

    // Validazione tipo
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo file non supportato: ${file.type}. Usa JPEG, PNG, WebP, AVIF, PDF, MP3, WAV, M4A o MP4.` },
        { status: 400 }
      );
    }

    // Validazione dimensione (env-driven: `UPLOAD_MAX_BYTES`, default 10 MB).
    // Check BEFORE `file.arrayBuffer()` per evitare buffer-allocation su
    // payload oversized che sarebbero rifiutati. 413 Payload Too Large è
    // semanticamente corretto rispetto al 400 used for input validation.
    if (file.size > MAX_UPLOAD_BYTES) {
      // KPI: oversized upload rejects help tuning del default 10MB.
      console.warn("[upload] Rejected oversized file", {
        size: file.size,
        max: MAX_UPLOAD_BYTES,
        contentType: file.type,
      });
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      const maxMB = (MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(
        { error: `File troppo grande (${sizeMB} MB). Massimo ${maxMB} MB (cap configurabile tramite UPLOAD_MAX_BYTES).` },
        { status: 413 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase non configurato — imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    // Genera nome file univoco
    const ext = file.name.split(".").pop() ?? "bin";
    const folder = file.type.startsWith("image/") ? "products" : "assets";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = `${folder}/${fileName}`;

    // Converti File in ArrayBuffer
    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);

    // Upload su Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      // Fail-fast: il bucket deve esistere in produzione, pre-creato via
      // `scripts/supabase/setup-storage.sql` (eseguito al deploy, non a
      // runtime). Mai `createBucket` runtime: su Vercel sarebbe race-prone
      // e maschererebbe bug di deploy. Hint configurazione solo per 404
      // bucket-missing; `message` resta off-client per evitare info-
      // disclosure di path/region interni dell'SDK Supabase.
      console.error("[upload] Storage upload failed:", {
        name: uploadError.name,
        statusCode: uploadError.statusCode,
        message: uploadError.message,
        bucket: BUCKET_NAME,
        filePath,
        size: file.size,
      });
      // Detection: `statusCode === "404"` (campo stabile del Supabase
      // Storage SDK, esposto come `string` cross-version) è la marker
      // primaria; `"bucket"` nel message è fallback safety-net se il campo
      // dovesse mancare. Evitiamo keyword più generiche come "not found"
      // perché matchano falsi positivi ("Object not found", "JWT not found",
      // ecc.) non legati al bucket mancante.
      const isBucketMissing =
        uploadError.statusCode === "404" ||
        uploadError.message?.toLowerCase().includes("bucket");
      const hint = isBucketMissing
        ? ` Bucket '${BUCKET_NAME}' deve essere pre-creato via scripts/supabase/setup-storage.sql (errore di CONFIGURAZIONE, non di runtime).`
        : " Dettagli nei logs server-side.";
      return NextResponse.json(
        { error: `Storage upload fallito.${hint}` },
        { status: 500 }
      );
    }

    // Ottieni URL pubblico
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno nel upload");
  }
}, "AUTH");
