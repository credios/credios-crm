import { z } from "zod";

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  usuarioId: z.string().optional(),
  acao: z.string().optional(),
  recursoTipo: z.string().optional(),
  dataDe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
