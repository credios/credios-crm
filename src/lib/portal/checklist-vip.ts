import type { DocItem, DocSection } from "./checklist";

/**
 * Checklist VIP — atendimento personalizado de alto valor.
 *
 * Curada à mão (não deriva do perfil como `buildChecklist`): só o que a mesa
 * de crédito precisa para COMEÇAR a análise. Nada de contrato social,
 * pró-labore ou extratos nesta etapa — isso vem depois, se o banco pedir.
 *
 * A certidão do estado civil é condicional: o cliente confirma o estado civil
 * na página e a lista se ajusta na hora. Função PURA — roda no client.
 *
 * As chaves (`key`) seguem o padrão do checklist normal → os documentos caem
 * na MESMA tabela `lead_documentos` e aparecem no card do CRM sem tratamento
 * especial.
 */

export type EstadoCivilVip =
  | "solteiro"
  | "casado"
  | "uniao"
  | "divorciado"
  | "viuvo";

export const ESTADO_CIVIL_VIP_LABEL: Record<EstadoCivilVip, string> = {
  solteiro: "Solteiro",
  casado: "Casado",
  uniao: "União estável",
  divorciado: "Divorciado",
  viuvo: "Viúvo",
};

/** Valor gravado em `leads.estado_civil` (mesmo vocabulário do resto do CRM). */
export const ESTADO_CIVIL_VIP_CRM: Record<EstadoCivilVip, string> = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  uniao: "União Estável",
  divorciado: "Divorciado(a)",
  viuvo: "Viúvo(a)",
};

export function estadoCivilVipFromCrm(v: string | null): EstadoCivilVip | null {
  switch ((v ?? "").trim()) {
    case "Solteiro(a)":
      return "solteiro";
    case "Casado(a)":
      return "casado";
    case "União Estável":
      return "uniao";
    case "Divorciado(a)":
      return "divorciado";
    case "Viúvo(a)":
      return "viuvo";
    default:
      return null;
  }
}

/** true quando o estado civil exige os dados do cônjuge na operação. */
export function exigeConjuge(ec: EstadoCivilVip | null): boolean {
  return ec === "casado" || ec === "uniao";
}

/** Documentos de comprovação do estado civil — variam por situação. */
function docsEstadoCivil(ec: EstadoCivilVip): DocItem[] {
  switch (ec) {
    case "solteiro":
      return [
        {
          key: "certidao_nascimento",
          categoria: "estado_civil",
          rotulo: "Certidão de nascimento",
          descricao: "Atualizada, com averbações se houver.",
          obrigatorio: true,
        },
      ];
    case "casado":
      return [
        {
          key: "certidao_casamento",
          categoria: "estado_civil",
          rotulo: "Certidão de casamento",
          descricao: "Atualizada, com averbações se houver.",
          obrigatorio: true,
        },
      ];
    case "uniao":
      return [
        {
          key: "declaracao_uniao_estavel",
          categoria: "estado_civil",
          rotulo: "Declaração ou escritura de união estável",
          descricao: "Se ainda não tiver, o consultor orienta como resolver.",
          obrigatorio: true,
        },
      ];
    case "divorciado":
      return [
        {
          key: "certidao_casamento_averbada",
          categoria: "estado_civil",
          rotulo: "Certidão de casamento com o divórcio averbado",
          descricao: "A averbação do divórcio precisa constar na certidão.",
          obrigatorio: true,
        },
      ];
    case "viuvo":
      return [
        {
          key: "certidao_casamento",
          categoria: "estado_civil",
          rotulo: "Certidão de casamento",
          descricao: "Atualizada, com a averbação do óbito se houver.",
          obrigatorio: true,
        },
        {
          key: "certidao_obito_conjuge",
          categoria: "estado_civil",
          rotulo: "Certidão de óbito do cônjuge",
          descricao: "Documento do cartório.",
          obrigatorio: true,
        },
      ];
  }
}

export function buildChecklistVip(ec: EstadoCivilVip | null): DocSection[] {
  const sections: DocSection[] = [
    {
      categoria: "titular",
      titulo: "Identificação",
      items: [
        {
          key: "documento_identidade",
          categoria: "titular",
          rotulo: "RG ou CNH",
          descricao: "Frente e verso. Foto do documento aberto serve.",
          obrigatorio: true,
          multiplos: true,
          maxArquivos: 2,
        },
        {
          key: "comprovante_residencia",
          categoria: "titular",
          rotulo: "Comprovante de residência",
          descricao: "Conta de luz, água ou telefone dos últimos 3 meses.",
          obrigatorio: true,
        },
      ],
    },
  ];

  // Certidão do estado civil — só aparece depois que ele confirma a situação.
  if (ec) {
    sections.push({
      categoria: "estado_civil",
      titulo: "Estado civil",
      items: docsEstadoCivil(ec),
    });
  }

  sections.push(
    {
      categoria: "renda",
      titulo: "Imposto de renda",
      descricao: "É o que a mesa precisa para começar a análise.",
      items: [
        {
          key: "irpf_declaracao",
          categoria: "renda",
          rotulo: "IRPF — declaração completa",
          descricao: "Último exercício, todas as páginas.",
          obrigatorio: true,
        },
        {
          key: "irpf_recibo",
          categoria: "renda",
          rotulo: "IRPF — recibo de entrega",
          descricao: "O comprovante de entrega da mesma declaração.",
          obrigatorio: true,
        },
      ],
    },
    {
      categoria: "imovel",
      titulo: "Imóvel da garantia",
      items: [
        {
          key: "matricula_imovel",
          categoria: "imovel",
          rotulo: "Matrícula atualizada",
          descricao: "Emitida no cartório de registro nos últimos 30 dias.",
          obrigatorio: true,
        },
        {
          key: "iptu",
          categoria: "imovel",
          rotulo: "IPTU do ano",
          descricao: "Carnê ou espelho — precisamos da inscrição do imóvel.",
          obrigatorio: true,
        },
        {
          key: "fotos_imovel",
          categoria: "imovel",
          rotulo: "Fotos do imóvel",
          descricao: "Fachada e cômodos principais. Adianta a avaliação.",
          obrigatorio: false,
          multiplos: true,
          maxArquivos: 10,
        },
      ],
    },
  );

  return sections;
}
