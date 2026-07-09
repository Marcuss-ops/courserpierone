/**
 * Tipi del database Supabase (generati automaticamente).
 * Aggiornato con i nuovi campi profilo utente pubblico.
 */
export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  username: string | null;
  bio: string | null;
  socialLinks: string | null; // JSON: { twitter, instagram, youtube, linkedin, website }
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Database = {
  public: {
    Tables: Record<string, any>;
    Views: Record<string, any>;
    Functions: Record<string, any>;
    Enums: Record<string, any>;
  };
};
