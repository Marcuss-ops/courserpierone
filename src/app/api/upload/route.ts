import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const BUCKET_NAME = "covers";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nessun file inviato" }, { status: 400 });
    }

    // Validazione tipo
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo file non supportato: ${file.type}. Usa JPEG, PNG, WebP o AVIF.` },
        { status: 400 }
      );
    }

    // Validazione dimensione
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Massimo 5 MB.` },
        { status: 400 }
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
    const ext = file.name.split(".").pop() ?? "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = `products/${fileName}`;

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
      // Se il bucket non esiste, prova a crearlo
      if (uploadError.message?.includes("bucket") || uploadError.message?.includes("not found")) {
        const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: MAX_SIZE,
          allowedMimeTypes: ALLOWED_TYPES,
        });

        if (createError) {
          console.error("Errore creazione bucket:", createError);
          return NextResponse.json(
            { error: `Impossibile creare il bucket di storage: ${createError.message}` },
            { status: 500 }
          );
        }

        // Riprova upload
        const { error: retryError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, buffer, {
            contentType: file.type,
            cacheControl: "31536000",
          });

        if (retryError) {
          console.error("Errore upload dopo creazione bucket:", retryError);
          return NextResponse.json(
            { error: `Errore nell'upload: ${retryError.message}` },
            { status: 500 }
          );
        }
      } else {
        console.error("Errore upload:", uploadError);
        return NextResponse.json(
          { error: `Errore nell'upload: ${uploadError.message}` },
          { status: 500 }
        );
      }
    }

    // Ottieni URL pubblico
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json(
      { error: "Errore interno nel upload" },
      { status: 500 }
    );
  }
}
