import { LogoCredios } from "@/components/portal-parceiro/cabecalho";

export default function PublicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <LogoCredios className="h-9" />
          <p className="text-sm text-muted-foreground">Portal de Parceiros</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
