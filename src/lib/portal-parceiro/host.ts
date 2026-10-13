// Domínio próprio do portal (fase 5). Quando parceiros.credios.com.br aponta
// pra este app, esse host serve SÓ o portal do parceiro: o CRM interno não
// fica acessível por ele, e os endereços do portal antigo (impressos em
// contratos e salvos em favoritos) são levados pro lugar novo.
//
// Sem dependência de Next — roda no proxy e é testável.

export const HOSTS_DO_PORTAL = ["parceiros.credios.com.br"];

export function ehHostDoPortal(host: string | null | undefined): boolean {
  if (!host) return false;
  return HOSTS_DO_PORTAL.includes(host.toLowerCase().split(":")[0]!);
}

const CRM = "https://crm.credios.com.br";
const BASE = "/portal-parceiro";

// Caminhos do portal antigo → novo. Prefixo exato ou seguido de "/".
const LEGADO: [string, string][] = [
  ["/entrar", `${BASE}/entrar`],
  ["/recuperar-senha", `${BASE}/recuperar-senha`],
  ["/termos", `${BASE}/termos`],
  ["/privacidade", `${BASE}/privacidade`],
  ["/app/clientes/novo", `${BASE}/clientes/novo`],
  ["/app/clientes", `${BASE}/clientes`],
  ["/app/comissoes", `${BASE}/comissoes`],
  ["/app/contrato", `${BASE}/contrato`],
  ["/app/perfil", `${BASE}/perfil`],
  ["/app", BASE],
  // Links de uso único do portal antigo não valem mais: manda pro login.
  ["/convite", `${BASE}/entrar`],
  ["/contrato", `${BASE}/entrar`],
  ["/redefinir-senha", `${BASE}/recuperar-senha`],
];

export type Decisao =
  | { tipo: "seguir" }
  | { tipo: "redirecionar"; destino: string; externo?: boolean };

/** O que fazer com um caminho pedido no host do portal. */
export function rotaNoHostDoPortal(pathname: string): Decisao {
  if (
    pathname === BASE ||
    pathname.startsWith(`${BASE}/`) ||
    pathname.startsWith("/api/portal-parceiro/") ||
    pathname.startsWith("/_next/")
  ) {
    return { tipo: "seguir" };
  }
  if (pathname === "/") return { tipo: "redirecionar", destino: BASE };

  // Verificação pública de contrato: o código vem no próprio caminho e está
  // impresso nos contratos já assinados — tem que continuar funcionando.
  if (pathname === "/verificar") return { tipo: "redirecionar", destino: `${BASE}/verificar` };
  const verificar = /^\/verificar\/([A-Za-z0-9-]{1,40})$/.exec(pathname);
  if (verificar) {
    return { tipo: "redirecionar", destino: `${BASE}/verificar/${verificar[1]!.toUpperCase()}` };
  }

  // Admin do portal antigo → gestão de parceiros no CRM (outro domínio).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return { tipo: "redirecionar", destino: `${CRM}/parceiros`, externo: true };
  }

  for (const [de, para] of LEGADO) {
    if (pathname === de || pathname.startsWith(`${de}/`)) {
      return { tipo: "redirecionar", destino: para };
    }
  }
  // Qualquer outra coisa (inclusive rotas do CRM interno) não existe aqui.
  return { tipo: "redirecionar", destino: BASE };
}
