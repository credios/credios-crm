-- Visualizações salvas (presets de filtro) por usuário nas telas de leads.
-- Escopo por usuário (FK user_id → users, cascade). `filtros` guarda os params
-- da URL (status, consultorId, sortBy, ...) como JSONB chave→valor, sem `page`.
-- Ver src/lib/validators/lead-view.ts e src/lib/leads/saved-views.ts.

CREATE TABLE IF NOT EXISTS "saved_lead_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "view_mode" text DEFAULT 'lista' NOT NULL,
  "filtros" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "saved_lead_views_user_id_users_id_fk" FOREIGN KEY ("user_id")
    REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saved_lead_views_user"
  ON "saved_lead_views" ("user_id", "created_at" DESC);
