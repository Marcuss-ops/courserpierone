import { getServerUser } from "@/lib/supabase/get-user";
import { ProfileForm } from "./profile-form";
import { AvatarUploader } from "./avatar-uploader";

/**
 * /account/profile — full profile editor.
 *
 * Layout:
 *   1. Avatar uploader (top) — uses /api/account/avatar (signed URL).
 *   2. ProfileForm — name/username/bio/socials via /api/account/profile PATCH.
 *
 * V1: email NON editabile (richiederebbe reverification flow Supabase).
 */
export default async function ProfilePage() {
  const { dbUser } = await getServerUser();
  // Layout-level redirect si occupa dell'auth: qui dbUser è garantito.
  if (!dbUser) return null;

  // Social links stored as JSON string in DB → parse to typed object.
  let socialLinks: Record<string, string> = {};
  if (dbUser.socialLinks) {
    try {
      const parsed: unknown = JSON.parse(dbUser.socialLinks);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        socialLinks = parsed as Record<string, string>;
      }
    } catch {
      // legacy malformed JSON → silent fallback to empty
    }
  }

  return (
    <div className="space-y-8">
      {/* Avatar section */}
      <section className="bg-cream-card border border-cream-border rounded-[28px] p-7 shadow-md shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <AvatarUploader
            currentImage={dbUser.image}
            userName={dbUser.name ?? dbUser.email.split("@")[0]}
          />
        </div>
      </section>

      {/* Profile form */}
      <section>
        <h2 className="sr-only">Modifica profilo</h2>
        <ProfileForm
          initialName={dbUser.name ?? ""}
          initialUsername={dbUser.username ?? ""}
          initialBio={dbUser.bio ?? ""}
          initialSocialLinks={socialLinks}
          email={dbUser.email}
        />
      </section>
    </div>
  );
}
