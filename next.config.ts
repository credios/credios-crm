import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O gerador de PDF do contrato de parceria lê o logo do disco em runtime
  // (src/lib/portal-parceiro/contrato/pdf.ts). Sem isso o arquivo pode ficar
  // fora do bundle das funções e o contrato sair sem logo (a falha é silenciosa).
  outputFileTracingIncludes: {
    "/*": ["./public/credios-logo.png"],
  },
};

export default nextConfig;
