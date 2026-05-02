// Páginas de auth chamam createClient() do Supabase em client components.
// Forçando dynamic evitamos prerender estático no build (que falharia em
// envs sem NEXT_PUBLIC_SUPABASE_URL setado, ex: primeiro deploy Vercel
// antes de configurar env vars).
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-muted/40 p-4">
      {children}
    </main>
  );
}
