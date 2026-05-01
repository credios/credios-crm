// Esta página é alcançada apenas se o middleware permitir (raro, pois ele já
// redireciona "/" para /leads ou /login). Mantemos um fallback minimalista.
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">Carregando...</p>
    </main>
  );
}
