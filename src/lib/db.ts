import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";

const connectionString = process.env.DATABASE_URL!;

// Supabase usa connection pooling no servidor; prepared statements quebram o pgbouncer
// em modo transaction. Mantemos prepare:false para compatibilidade.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
