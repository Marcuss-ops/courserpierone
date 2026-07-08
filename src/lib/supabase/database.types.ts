/**
 * Tipi del database Supabase (generati automaticamente).
 * Per ora usiamo un tipo generico; dopo il primo `supabase gen types` 
 * questo file verrà sostituito con i tipi reali.
 */
export type Database = {
  public: {
    Tables: Record<string, any>;
    Views: Record<string, any>;
    Functions: Record<string, any>;
    Enums: Record<string, any>;
  };
};
