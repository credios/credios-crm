// Seção de documento legal (título + corpo) — usada nas páginas públicas
// /privacidade, /termos e /exclusao-de-dados.
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
