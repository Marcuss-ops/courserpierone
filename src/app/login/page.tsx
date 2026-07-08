import { Suspense } from "react";
import { cookies } from "next/headers";
import { Loader2 } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";

export default async function LoginPage() {
  // Read locale server-side (cookie is httpOnly, not accessible from JS)
  let lang = "en";
  try {
    const cookieStore = await cookies();
    lang = cookieStore.get("locale")?.value?.split("-")[0] ?? "en";
  } catch {}

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-black/40" />
        </div>
      }
    >
      <AuthForm lang={lang} />
    </Suspense>
  );
}
