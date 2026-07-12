export { createClient as createServerClient } from "@/lib/supabase/server";
export { getServerUser } from "@/lib/supabase/get-user";
export {
  USER_ROLES,
  DEFAULT_USER_ROLE,
  isKnownRole,
  assertUserRole,
  isAdmin,
  isCreator,
  isStudent,
  isStaff,
  canActAsCreator,
  roleLabel,
  type UserRole,
} from "@/lib/auth/roles";
