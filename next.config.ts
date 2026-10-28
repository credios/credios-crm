import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O gerador de PDF do contrato de parceria lê o logo do disco em runtime
  // (src/lib/portal-parceiro/contrato/pdf.ts). Sem isso o arquivo pode ficar
  // fora do bundle das funções e o contrato sair sem logo (a falha é silenciosa).
  // O mesmo vale pra fontes e logo do PDF da simulação do fundo
  // (src/lib/simulador/fundo-pdf.ts, lidos de assets/fundo).
  outputFileTracingIncludes: {
    "/*": ["./public/credios-logo.png", "./assets/fundo/*.ttf", "./assets/fundo/*.png"],
  },
};

export default nextConfig;
