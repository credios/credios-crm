/**
 * Motor da checklist personalizada do portal de documentos.
 *
 * A partir do que o CRM já sabe sobre o lead (estado civil, ocupação, valor
 * buscado, situação do imóvel, dados do cônjuge), monta exatamente a lista de
 * documentos que ESTE cliente precisa enviar — com linguagem apropriada a cada
 * perfil. É o que diferencia o portal da Credios de um formulário genérico.
 *
 * Função pura e testável: não toca em DB nem em rede.
 */

export type DocCategoria =
  | "titular"
  | "renda"
  | "estado_civil"
  | "conjuge"
  | "imovel";

export type DocItem = {
  /** Chave estável usada no storage e no metadado (lead_documentos.tipo). */
  key: string;
  categoria: DocCategoria;
  rotulo: string;
  descricao: string;
  obrigatorio: boolean;
  /** Aceita múltiplos arquivos (extratos, holerites, fotos). */
  multiplos?: boolean;
  maxArquivos?: number;
};

export type DocSection = {
  categoria: DocCategoria;
  titulo: string;
  descricao?: string;
  items: DocItem[];
  /** Observação exibida mesmo quando a seção não tem upload (ex.: autônomo). */
  nota?: string;
};

// Crédito a partir do qual o IRPF passa a ser obrigatório (R$ 400.000).
const IRPF_OBRIGATORIO_CENTAVOS = 400_000_00;

export type ChecklistLead = {
  estadoCivil: string | null;
  ocupacao: string | null;
  tipoPessoa: string | null;
  valorCreditoCentavos: number | null;
  situacaoImovel: string | null;
  conjugeEmail: string | null;
  conjugeWhatsapp: string | null;
  conjugeCompoeRenda: boolean | null;
  conjugeOcupacao: string | null;
};

type EstadoCivil =
  | "solteiro"
  | "casado"
  | "uniao"
  | "divorciado"
  | "viuvo"
  | "desconhecido";

type Ocupacao =
  | "empresario"
  | "clt"
  | "servidor"
  | "aposentado"
  | "autonomo"
  | "outro";

function normEstadoCivil(v: string | null): EstadoCivil {
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
      return "desconhecido";
  }
}

function normOcupacao(v: string | null, tipoPessoa: string | null): Ocupacao {
  const s = (v ?? "").trim();
  if (s === "Empresário" || tipoPessoa === "Pessoa Jurídica") return "empresario";
  if (s === "CLT") return "clt";
  // O site grava "Funcionário Público"; o CRM usa "Servidor Público". Cobre os dois.
  if (s === "Servidor Público" || s === "Funcionário Público") return "servidor";
  if (s === "Aposentado") return "aposentado";
  if (s === "Autônomo") return "autonomo";
  return "outro";
}

/** Documentos de renda do cônjuge — quando ele compõe renda. Por ocupação. */
function buildConjugeRendaSection(ocupacao: string | null): DocSection {
  const ocup = normOcupacao(ocupacao, null);
  const sec: DocSection = {
    categoria: "conjuge",
    titulo: "Renda do cônjuge",
    descricao: "Comprovação de renda de quem vai compor a renda com você.",
    items: [],
  };
  if (ocup === "empresario") {
    sec.items.push(
      { key: "conjuge_contrato_social", categoria: "conjuge", rotulo: "Contrato social (empresa do cônjuge)", descricao: "Última alteração consolidada.", obrigatorio: false },
      { key: "conjuge_balanco_dre", categoria: "conjuge", rotulo: "Balanço e DRE do último ano (empresa do cônjuge)", descricao: "Demonstrações contábeis mais recentes.", obrigatorio: false },
      { key: "conjuge_extrato_pj", categoria: "conjuge", rotulo: "Extratos PJ do cônjuge — últimos 3 meses", descricao: "Conta da empresa com maior movimentação.", obrigatorio: false },
      { key: "conjuge_declaracao_faturamento", categoria: "conjuge", rotulo: "Declaração de faturamento (12 meses) do cônjuge", descricao: "Assinada pelo contador.", obrigatorio: false },
    );
    sec.nota = "Opcionais para começar — ajudam na análise e podem ser solicitados pelos bancos mais à frente.";
  } else if (ocup === "clt") {
    sec.items.push({ key: "conjuge_holerites", categoria: "conjuge", rotulo: "Últimos 3 holerites do cônjuge", descricao: "Contracheques mais recentes.", obrigatorio: true });
  } else if (ocup === "servidor") {
    sec.items.push({ key: "conjuge_holerites", categoria: "conjuge", rotulo: "Últimos 3 contracheques do cônjuge", descricao: "Demonstrativos de pagamento dos últimos 3 meses.", obrigatorio: true });
  } else if (ocup === "aposentado") {
    sec.items.push({ key: "conjuge_proventos", categoria: "conjuge", rotulo: "Comprovantes de proventos do cônjuge", descricao: "Extrato/demonstrativo do INSS/previdência dos últimos 3 meses.", obrigatorio: true });
  } else if (ocup === "autonomo") {
    sec.items.push({ key: "conjuge_extratos", categoria: "conjuge", rotulo: "Extratos bancários do cônjuge — últimos 3 meses", descricao: "De preferência da conta com maior movimentação.", obrigatorio: true });
  } else {
    sec.nota = "Seu consultor confirma com você quais documentos de renda do cônjuge enviar.";
  }
  return sec;
}

export function buildChecklist(lead: ChecklistLead): DocSection[] {
  const civil = normEstadoCivil(lead.estadoCivil);
  const ocup = normOcupacao(lead.ocupacao, lead.tipoPessoa);
  const sections: DocSection[] = [];

  // ── 1. Titular ─────────────────────────────────────────────────────────
  const irpfObrigatorio =
    lead.valorCreditoCentavos != null &&
    lead.valorCreditoCentavos >= IRPF_OBRIGATORIO_CENTAVOS;

  sections.push({
    categoria: "titular",
    titulo: "Seus documentos",
    descricao: "Os básicos para identificar você e iniciar a análise.",
    items: [
      {
        key: "identidade",
        categoria: "titular",
        rotulo: "Documento de identificação",
        descricao: "RG, CNH, RNE ou CPF. Pode ser foto nítida, frente e verso.",
        obrigatorio: true,
      },
      {
        key: "comprovante_residencia",
        categoria: "titular",
        rotulo: "Comprovante de residência",
        descricao:
          "Conta de luz, água, telefone ou internet dos últimos 3 meses.",
        obrigatorio: true,
      },
      {
        key: "irpf",
        categoria: "titular",
        rotulo: "Imposto de Renda — declaração e recibo",
        descricao: irpfObrigatorio
          ? "Declaração completa e recibo de entrega do último IRPF."
          : "Para o valor que você busca, não é obrigatório — mas, se tiver em mãos, acelera bastante a análise.",
        obrigatorio: irpfObrigatorio,
      },
      {
        key: "extratos_bancarios",
        categoria: "titular",
        rotulo: "Extratos bancários — últimos 3 meses",
        descricao:
          "De preferência da conta com maior movimentação. Pode enviar vários arquivos.",
        obrigatorio: true,
        multiplos: true,
      },
    ],
  });

  // ── 2. Comprovação de renda (por ocupação) ─────────────────────────────
  const renda: DocSection = {
    categoria: "renda",
    titulo: "Comprovação de renda",
    items: [],
  };

  if (ocup === "empresario") {
    renda.descricao =
      "Como você é empresário(a), a renda é comprovada pela empresa. Neste momento, estes documentos são opcionais.";
    renda.items.push(
      {
        key: "contrato_social",
        categoria: "renda",
        rotulo: "Contrato social",
        descricao: "Última alteração consolidada da empresa.",
        obrigatorio: false,
      },
      {
        key: "doc_socio_adm",
        categoria: "renda",
        rotulo: "RG ou CNH do sócio administrador",
        descricao: "Documento de identificação de quem administra a empresa.",
        obrigatorio: false,
      },
      {
        key: "balanco_dre",
        categoria: "renda",
        rotulo: "Balanço e DRE do último ano",
        descricao: "Demonstrações contábeis do exercício mais recente.",
        obrigatorio: false,
      },
      {
        key: "extrato_pj",
        categoria: "renda",
        rotulo: "Extratos PJ — últimos 3 meses",
        descricao: "Conta da empresa com maior movimentação.",
        obrigatorio: false,
        multiplos: true,
      },
      {
        key: "balancete",
        categoria: "renda",
        rotulo: "Balancete atualizado",
        descricao: "Balancete do exercício corrente.",
        obrigatorio: false,
      },
      {
        key: "declaracao_faturamento",
        categoria: "renda",
        rotulo: "Declaração de faturamento — últimos 12 meses",
        descricao: "Assinada pelo contador da empresa.",
        obrigatorio: false,
      },
    );
    renda.nota =
      "Estes documentos não são obrigatórios para começar — já iniciamos a aprovação do seu crédito sem eles. Mas ajudam bastante na análise e podem ser solicitados pelos bancos mais à frente. Se já tiver em mãos, enviar agora adianta tudo; caso algum seja necessário, a gente te avisa.";
  } else if (ocup === "clt") {
    renda.items.push({
      key: "holerites",
      categoria: "renda",
      rotulo: "Últimos 3 holerites",
      descricao: "Seus 3 contracheques mais recentes.",
      obrigatorio: true,
      multiplos: true,
    });
  } else if (ocup === "servidor") {
    renda.items.push({
      key: "holerites",
      categoria: "renda",
      rotulo: "Últimos 3 contracheques",
      descricao: "Demonstrativos de pagamento dos últimos 3 meses.",
      obrigatorio: true,
      multiplos: true,
    });
  } else if (ocup === "aposentado") {
    renda.items.push({
      key: "holerites",
      categoria: "renda",
      rotulo: "Últimos 3 comprovantes de proventos",
      descricao:
        "Extrato ou demonstrativo de pagamento do INSS/previdência dos últimos 3 meses.",
      obrigatorio: true,
      multiplos: true,
    });
  } else if (ocup === "autonomo") {
    renda.nota =
      "No seu caso, os extratos bancários dos últimos 3 meses já comprovam a renda — não precisa enviar mais nada aqui.";
  } else {
    renda.nota =
      "Seu consultor confirma com você quais documentos de renda enviar — fique tranquilo, a gente te orienta.";
  }
  sections.push(renda);

  // ── 3. Cônjuge + estado civil ──────────────────────────────────────────
  if (civil === "casado" || civil === "uniao") {
    const temContatoConjuge = Boolean(lead.conjugeEmail && lead.conjugeWhatsapp);
    sections.push({
      categoria: "conjuge",
      titulo: "Cônjuge",
      descricao:
        "No crédito com garantia de imóvel, seu cônjuge participa da operação.",
      items: [
        {
          key: "conjuge_identidade",
          categoria: "conjuge",
          rotulo: "Documento de identificação do cônjuge",
          descricao: "RG, CNH ou RNE do seu cônjuge.",
          obrigatorio: true,
        },
        {
          key: "certidao_casamento",
          categoria: "conjuge",
          rotulo:
            civil === "uniao"
              ? "Declaração ou escritura de união estável"
              : "Certidão de casamento",
          descricao:
            civil === "uniao"
              ? "Se tiver. Caso não tenha, seu consultor te orienta."
              : "Atualizada.",
          obrigatorio: civil === "casado",
        },
      ],
      nota: temContatoConjuge
        ? "Já temos o e-mail e o celular do seu cônjuge. ✓"
        : "Seu consultor vai confirmar o e-mail e o celular do seu cônjuge no contato.",
    });

    // Renda do cônjuge — só quando ele vai compor renda (marcado no simulador
    // ou no próprio portal).
    if (lead.conjugeCompoeRenda) {
      sections.push(buildConjugeRendaSection(lead.conjugeOcupacao));
    }
  } else if (civil === "solteiro") {
    sections.push({
      categoria: "estado_civil",
      titulo: "Estado civil",
      items: [
        {
          key: "certidao_nascimento",
          categoria: "estado_civil",
          rotulo: "Certidão de nascimento",
          descricao: "Atualizada.",
          obrigatorio: true,
        },
      ],
    });
  } else if (civil === "divorciado" || civil === "viuvo") {
    sections.push({
      categoria: "estado_civil",
      titulo: "Estado civil",
      items: [
        {
          key: "certidao_averbada",
          categoria: "estado_civil",
          rotulo: "Certidão de casamento com averbação",
          descricao:
            civil === "divorciado"
              ? "Com a averbação do divórcio."
              : "Com a averbação do óbito (ou certidão de óbito do cônjuge).",
          obrigatorio: true,
        },
      ],
    });
  }

  // ── 4. Imóvel ──────────────────────────────────────────────────────────
  sections.push({
    categoria: "imovel",
    titulo: "Documentos do imóvel",
    descricao: "Do imóvel que será dado em garantia.",
    items: [
      {
        key: "matricula",
        categoria: "imovel",
        rotulo: "Matrícula do imóvel",
        descricao: "Atualizada — idealmente emitida nos últimos 30 dias.",
        obrigatorio: true,
      },
      {
        key: "iptu",
        categoria: "imovel",
        rotulo: "IPTU",
        descricao: "Carnê ou espelho do IPTU do imóvel.",
        obrigatorio: true,
      },
      {
        key: "fotos_imovel",
        categoria: "imovel",
        rotulo: "Fotos do imóvel",
        descricao:
          "Até 5 fotos boas. Opcional — mas ajudam bastante na avaliação do valor do imóvel.",
        obrigatorio: false,
        multiplos: true,
        maxArquivos: 5,
      },
    ],
  });

  // Todo item aceita múltiplos arquivos (cliente manda CNH em 2 fotos, matrícula
  // em várias etc.). No download, o sistema junta tudo num PDF na ordem de envio.
  for (const s of sections) {
    for (const item of s.items) {
      if (!item.multiplos) item.multiplos = true;
    }
  }

  return sections;
}

/** Conjunto de chaves de documentos obrigatórios (para cálculo de progresso). */
export function chavesObrigatorias(sections: DocSection[]): string[] {
  return sections
    .flatMap((s) => s.items)
    .filter((i) => i.obrigatorio)
    .map((i) => i.key);
}
