import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com SERVICE ROLE — bypassa RLS. Uso EXCLUSIVO server-side
 * (rotas/handlers); nunca importar em código que vá pro browser. Serve às
 * operações de Storage do portal de documentos no bucket privado
 * `documentos-leads` (upload e geração de URL assinada).
 */
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const DOCUMENTOS_BUCKET = "documentos-leads";
