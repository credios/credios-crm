/**
 * Tipos compartilhados do engine de roteamento (CLAUDE.md §6.4).
 * Não importa nada server-only — pode ser usado em testes Vitest.
 */

export type AcaoTipo =
  | "atribuir_usuario"
  | "round_robin_grupo"
  | "pool_nao_atribuido";

/** Condições aceitas em regras_roteamento.condicoes (JSONB). */
export type RuleCondicoes = {
  /** Centavos. Lead com valor < min não bate. */
  valor_credito_min?: number;
  valor_credito_max?: number;
  valor_imovel_min?: number;
  valor_imovel_max?: number;
  /** Lista de UFs (2 letras maiúsculas). */
  estado_in?: string[];
  origem_in?: string[];
  tipo_imovel_in?: string[];
  /** true = só vale dentro do horário comercial; false = só fora; ausente = não importa. */
  horario_comercial?: boolean;
};

export type AcaoAtribuirUsuario = {
  tipo: "atribuir_usuario";
  usuario_id: string;
};

export type AcaoRoundRobinGrupo = {
  tipo: "round_robin_grupo";
  grupo_usuarios: string[];
};

export type AcaoPoolNaoAtribuido = {
  tipo: "pool_nao_atribuido";
};

export type RuleAction =
  | AcaoAtribuirUsuario
  | AcaoRoundRobinGrupo
  | AcaoPoolNaoAtribuido;

/** Versão "in-memory" da regra usada pelo engine (após decode de JSONB). */
export type RoutingRule = {
  id: string;
  nome: string;
  ativa: boolean;
  prioridade: number;
  condicoes: RuleCondicoes;
  acao: AcaoTipo;
  parametros: Record<string, unknown> | null;
};

/** Subset do lead usado pelo engine para avaliar condições. */
export type RoutingContext = {
  valorCreditoCentavos: number | null;
  valorImovelCentavos: number | null;
  estado: string | null;
  origem: string | null;
  tipoImovel: string | null;
  /**
   * Override opcional para horário comercial. Se omitido, engine usa
   * `dentroHorarioComercial(new Date())`. Útil em tests pra fixar o tempo.
   */
  horarioComercial?: boolean;
};

export type RoutingResult = {
  consultorId: string | null;
  regraAplicada: string;
  /** UUID da regra que disparou (null se pool_default ou erro). */
  regraId: string | null;
};

/**
 * Dependências externas do engine — abstraídas pra permitir mock em tests.
 */
export type RoutingDeps = {
  listActiveRules: () => Promise<RoutingRule[]>;
  /**
   * Avança o ponteiro round-robin da regra e retorna o próximo usuário.
   * Em dryRun, calcula sem persistir.
   */
  pickNextRoundRobin: (
    regraId: string,
    grupo: string[],
    options?: { dryRun?: boolean },
  ) => Promise<string>;
};
