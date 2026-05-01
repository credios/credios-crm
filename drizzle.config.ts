import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Isola escopo do drizzle-kit ao schema `public`. O schema `auth` é gerenciado
  // pelo Supabase; FKs cruzando para `auth.users` continuam funcionando.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
