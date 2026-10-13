/**
 * Migração do portal antigo (credios-parceiros, Prisma) para o CRM — fase 4d.
 *
 * O que migra:
 *   - contratos assinados → parceiro_contratos, com os PDFs BYTE A BYTE, o
 *     código de verificação, o hash e as datas originais;
 *   - trilha de auditoria de cada contrato → parceiro_contrato_eventos, com
 *     data/hora, IP e dispositivo originais;
 *   - chave PIX e CPF/CNPJ do parceiro, só onde o CRM está vazio.
 *
 * O que NÃO migra, de propósito:
 *   - senhas (bcrypt lá, scrypt aqui): cada parceiro recebe convite pelo CRM;
 *   - indicações: já são leads do CRM e já estão ligadas ao parceiro (0049);
 *   - comissões: não há nenhuma no portal antigo;
 *   - dados bancários (bankInfo): o CRM só guarda a chave PIX.
 *
 * Seguro pra rodar mais de uma vez: contrato já migrado (legado_id) é pulado.
 * Tudo numa transação — qualquer erro desfaz a execução inteira.
 *
 * Uso (na raiz do credios-crm):
 *   LEGADO_DATABASE_URL=... node --env-file=.env.local --import tsx scripts/migrar-portal-parceiros.mts            # simulação
 *   LEGADO_DATABASE_URL=... node --env-file=.env.local --import tsx scripts/migrar-portal-parceiros.mts --executar # grava
 */
import { createHash } from "node:crypto";

import postgres from "postgres";

const EXECUTAR = process.argv.includes("--executar");

function conectarCrm() {
  const url = process.env.DATABASE_POOLER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL do CRM ausente");
  // Host direto da Supabase é IPv6-only — localmente só o pooler responde.
  const m = url.match(
    /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@db\.([a-z0-9]+)\.supabase\.co:(\d+)\/(\S+)$/,
  );
  return m
    ? postgres({
        host: `aws-1-${process.env.DATABASE_POOLER_REGION ?? "sa-east-1"}.pooler.supabase.com`,
        port: 6543,
        user: `postgres.${m[3]}`,
        password: decodeURIComponent(m[2]!),
        database: m[5]!.split("?")[0],
        prepare: false,
        max: 1,
        ssl: "require",
      })
    : postgres(url, { prepare: false, max: 1 });
}

const STATUS: Record<string, string> = {
  SIGNED: "concluido",
  PARTNER_SIGNED: "assinado_parceiro",
};

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const digitos = (s: string | null) => (s ?? "").replace(/\D/g, "");

async function main() {
  const legadoUrl = process.env.LEGADO_DATABASE_URL;
  if (!legadoUrl) throw new Error("Defina LEGADO_DATABASE_URL (DATABASE_URL do credios-parceiros)");
  const legado = postgres(legadoUrl, { prepare: false, max: 1 });
  const crm = conectarCrm();
  const problemas: string[] = [];

  try {
    const parceirosLegado = await legado`
      select id, "legalName", document, email, "personType", "repName", "pixKey",
             "bankInfo" is not null as tem_banco
      from "Partner"`;
    const contratos = await legado`
      select c.id, c."partnerId", c.status, c."verifyCode", c."documentHash",
             c."pdfUnsigned", c."pdfSigned", c."sentAt", c."viewedAt", c."signedAt",
             c."adminSignedAt", c."adminSignerName", c."createdAt",
             t.version, t."bodyHtml"
      from "Contract" c join "ContractTemplate" t on t.id = c."templateId"
      where c.status in ('SIGNED', 'PARTNER_SIGNED')
      order by c."createdAt"`;
    const eventos = await legado`
      select "contractId", event, ip, "userAgent", metadata, "createdAt"
      from "ContractAuditEvent" order by "createdAt"`;

    const parceirosCrm = await crm`
      select id, portal_partner_id, cpf_cnpj, pix_chave from parceiros
      where portal_partner_id is not null`;
    const porPortalId = new Map(parceirosCrm.map((p) => [p.portal_partner_id as string, p]));
    // Na simulação a tabela pode ainda não existir (migration 0053 pendente).
    const [{ existe }] = await crm`
      select to_regclass('public.parceiro_contratos') is not null as existe`;
    if (!existe && EXECUTAR) {
      throw new Error("Tabela parceiro_contratos não existe — aplique a migration 0053 antes.");
    }
    if (!existe) console.log("Aviso: migration 0053 ainda não aplicada no CRM (simulação segue).");
    const jaMigrados = new Set(
      existe
        ? (await crm`select legado_id from parceiro_contratos where legado_id is not null`).map(
            (r) => r.legado_id as string,
          )
        : [],
    );
    const codigosNoCrm = new Set(
      existe
        ? (await crm`select codigo_verificacao from parceiro_contratos`).map(
            (r) => r.codigo_verificacao as string,
          )
        : [],
    );

    // ── Plano ────────────────────────────────────────────────────────────
    const atualizarParceiro: { id: string; pix: string | null; doc: string | null }[] = [];
    let comBanco = 0;
    for (const p of parceirosLegado) {
      const alvo = porPortalId.get(p.id);
      if (!alvo) {
        problemas.push(`Parceiro do portal sem correspondente no CRM: ${p.legalName} (${p.id})`);
        continue;
      }
      if (p.tem_banco) comBanco++;
      const pix = !alvo.pix_chave && p.pixKey ? (p.pixKey as string) : null;
      const doc = !digitos(alvo.cpf_cnpj) && digitos(p.document) ? digitos(p.document) : null;
      if (pix || doc) atualizarParceiro.push({ id: alvo.id as string, pix, doc });
    }

    const inserir: typeof contratos = [] as never;
    for (const c of contratos) {
      if (jaMigrados.has(c.id)) continue;
      const alvo = porPortalId.get(c.partnerId);
      if (!alvo) {
        problemas.push(`Contrato ${c.verifyCode}: parceiro ${c.partnerId} não existe no CRM`);
        continue;
      }
      if (codigosNoCrm.has(c.verifyCode)) {
        problemas.push(`Contrato ${c.verifyCode}: código já existe no CRM em outro contrato`);
        continue;
      }
      if (c.status === "SIGNED") {
        if (!c.pdfSigned) {
          problemas.push(`Contrato ${c.verifyCode}: SIGNED sem PDF final`);
          continue;
        }
        // Prova de integridade: o hash gravado no portal tem que bater com os
        // bytes que estamos prestes a copiar.
        if (sha256(Buffer.from(c.pdfSigned)) !== c.documentHash) {
          problemas.push(`Contrato ${c.verifyCode}: hash do PDF final NÃO confere`);
          continue;
        }
      }
      inserir.push(c);
    }

    console.log(`\n=== Migração do portal de parceiros (${EXECUTAR ? "EXECUÇÃO" : "SIMULAÇÃO"}) ===`);
    console.log(`Parceiros no portal antigo ......... ${parceirosLegado.length}`);
    console.log(`  com correspondente no CRM ........ ${parceirosLegado.length - problemas.filter((x) => x.startsWith("Parceiro")).length}`);
    console.log(`  a completar (PIX / CPF-CNPJ) ..... ${atualizarParceiro.length}`);
    console.log(`  com dados bancários (não migram) . ${comBanco}`);
    console.log(`Contratos assinados no portal ...... ${contratos.length}`);
    console.log(`  já migrados ...................... ${contratos.filter((c) => jaMigrados.has(c.id)).length}`);
    console.log(`  a migrar ......................... ${inserir.length}`);
    console.log(`  eventos de auditoria a copiar .... ${eventos.filter((e) => inserir.some((c) => c.id === e.contractId)).length}`);
    if (problemas.length > 0) {
      console.log(`\nPROBLEMAS (${problemas.length}):`);
      for (const p of problemas) console.log(`  - ${p}`);
    }

    if (!EXECUTAR) {
      console.log("\nSimulação: nada foi gravado. Rode com --executar para migrar.");
      return;
    }
    if (problemas.length > 0) {
      throw new Error("Há problemas acima — resolva antes de executar (nada foi gravado).");
    }

    await crm.begin(async (tx) => {
      for (const p of atualizarParceiro) {
        await tx`
          update parceiros set
            pix_chave = coalesce(pix_chave, ${p.pix}),
            cpf_cnpj = coalesce(nullif(cpf_cnpj, ''), ${p.doc}),
            updated_at = now()
          where id = ${p.id}`;
      }
      for (const c of inserir) {
        const alvo = porPortalId.get(c.partnerId)!;
        const [novo] = await tx`
          insert into parceiro_contratos (
            parceiro_id, versao_modelo, corpo_html, status, codigo_verificacao,
            otp_verificado, pdf_original, pdf_assinado, hash_documento,
            enviado_em, visualizado_em, assinado_em, credios_assinado_em,
            credios_assinante_nome, legado_id, created_at, updated_at
          ) values (
            ${alvo.id}, ${c.version}, ${c.bodyHtml}, ${STATUS[c.status]!}, ${c.verifyCode},
            true, ${c.pdfUnsigned ? Buffer.from(c.pdfUnsigned) : null},
            ${c.pdfSigned ? Buffer.from(c.pdfSigned) : null}, ${c.documentHash},
            ${c.sentAt}, ${c.viewedAt}, ${c.signedAt}, ${c.adminSignedAt},
            ${c.adminSignerName}, ${c.id}, ${c.createdAt}, now()
          ) returning id`;
        for (const e of eventos.filter((x) => x.contractId === c.id)) {
          await tx`
            insert into parceiro_contrato_eventos (contrato_id, evento, ip, user_agent, metadata, criado_em)
            values (${novo!.id}, ${e.event}, ${e.ip}, ${e.userAgent},
                    ${e.metadata == null ? null : tx.json(e.metadata)}, ${e.createdAt})`;
        }
      }

      // Conferência dentro da transação: os bytes gravados têm que ter o
      // mesmo hash dos originais. Divergiu → erro → rollback de tudo.
      const conferencia = await tx`
        select codigo_verificacao, hash_documento,
               encode(sha256(pdf_assinado), 'hex') as hash_real
        from parceiro_contratos where legado_id is not null and pdf_assinado is not null`;
      const ruins = conferencia.filter((r) => r.hash_documento !== r.hash_real);
      if (ruins.length > 0) {
        throw new Error(
          `Hash divergente após gravar: ${ruins.map((r) => r.codigo_verificacao).join(", ")}`,
        );
      }
      console.log(`\nGravado e conferido: ${inserir.length} contratos, hashes íntegros (${conferencia.length} no total).`);
    });
  } finally {
    await legado.end();
    await crm.end();
  }
}

main().catch((e) => {
  console.error("\nERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
