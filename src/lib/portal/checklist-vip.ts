import type { DocSection } from "./checklist";

/**
 * Checklist VIP — atendimento personalizado de alto valor.
 *
 * Diferente do `buildChecklist` (que deriva a lista do perfil do lead), esta é
 * uma lista CURADA à mão para um caso específico: empresário, casado, operação
 * de alto ticket. Copy mínima (o cliente já falou com o consultor — a página
 * não precisa vender nada, só receber).
 *
 * As chaves (`key`) seguem o mesmo padrão do checklist normal → os documentos
 * caem na MESMA tabela `lead_documentos` e aparecem no card de documentos do
 * CRM sem tratamento especial.
 */
export function buildChecklistVipEmpresario(): DocSection[] {
  return [
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
        {
          key: "certidao_casamento",
          categoria: "estado_civil",
          rotulo: "Certidão de casamento",
          descricao: "Atualizada, com averbações se houver.",
          obrigatorio: true,
        },
      ],
    },
    {
      categoria: "renda",
      titulo: "Renda e empresa",
      descricao: "O que os bancos pedem de sócio/empresário.",
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
        {
          key: "extratos_bancarios",
          categoria: "renda",
          rotulo: "Extratos bancários — últimos 3 meses",
          descricao: "Da conta com maior movimentação (PF ou PJ).",
          obrigatorio: true,
          multiplos: true,
          maxArquivos: 6,
        },
        {
          key: "contrato_social",
          categoria: "renda",
          rotulo: "Contrato social",
          descricao: "Última alteração consolidada da empresa.",
          obrigatorio: true,
        },
        {
          key: "pro_labore_distribuicao",
          categoria: "renda",
          rotulo: "Pró-labore ou distribuição de lucros",
          descricao: "Recibos, DECORE ou balancete. Se tiver, ajuda muito.",
          obrigatorio: false,
          multiplos: true,
          maxArquivos: 4,
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
  ];
}
