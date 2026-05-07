// Route group `(print)`. Sem sidebar, sem header — só conteúdo. Usado por
// páginas que abrem em janela própria (gerar PDF, etc.) e que precisam ficar
// fora do layout do app.

export const dynamic = "force-dynamic";

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="min-h-screen bg-white">{children}</main>;
}
