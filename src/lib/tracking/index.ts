// Public API da lib de tracking. Tudo o que outras partes do app importam
// deve sair daqui — facilita refactors internos sem mexer em consumidores.

export {
  CHANNELS,
  CANONICAL_SOURCES,
  CANONICAL_SOURCE_SET,
  SOURCE_TO_CHANNEL,
  SOURCE_TO_PAID,
  UTM_SOURCE_ALIASES,
  isCanonicalSource,
  isChannel,
} from "./taxonomy";
export type { Channel, CanonicalSource } from "./taxonomy";

export { matchClickId, ALL_CLICK_IDS } from "./click-id-chain";
export type { ClickIds, ClickIdMatch } from "./click-id-chain";

export {
  parseReferrer,
  parseReferrerSimple,
  isAiReferrer,
  AI_HOSTNAMES,
} from "./referrer";
export type { ReferrerMatch } from "./referrer";

export { classifyTouch, validateClientClassification } from "./classify";
export type { ClassifyInput, ClassifyResult } from "./classify";
