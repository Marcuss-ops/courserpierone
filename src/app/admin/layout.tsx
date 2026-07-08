import AdminAuthGuard from "@/components/admin/admin-auth-guard";
import AdminShell from "./AdminShell";

/**
 * Admin Layout — server component.
 *
 * Wraps the admin UI with AdminAuthGuard to enforce role-based access
 * (server-side check using Supabase + Prisma).
 *
 * AdminShell is a client component that renders the sidebar/layout chrome.
 * Splitting server (auth check) from client (UI shell) avoids pulling
 * `next/headers` into the client bundle.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminAuthGuard>
      <AdminShell>{children}</AdminShell>
    </AdminAuthGuard>
  );
}
