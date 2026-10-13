import type { Metadata } from "next";

import { LegalSection } from "@/components/legal/legal-section";
import { CREDIOS } from "@/lib/portal-parceiro/contrato/modelo";

export const metadata: Metadata = { title: "Aviso de Privacidade" };

const ATUALIZADO_EM = "13 de outubro de 2026";

export default function PrivacidadePortalPage() {
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Aviso de Privacidade do Portal de Parceiros
        </h1>
        <p className="text-sm text-muted-foreground">Última atualização: {ATUALIZADO_EM}</p>
      </header>

      <p>
        Este Aviso explica como a <strong>{CREDIOS.razaoSocial}</strong>, CNPJ {CREDIOS.cnpj}{" "}
        (&quot;Credios&quot;), trata dados pessoais no Portal de Parceiros, em conformidade com
        a Lei nº 13.709/2018 (LGPD). A Credios é a controladora dos dados descritos aqui.
      </p>

      <LegalSection title="1. Dados do parceiro">
        <p>Tratamos os seguintes dados de quem é parceiro ou representa um parceiro:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Cadastro:</strong> nome, empresa, CPF ou CNPJ, e-mail, telefone, cidade e UF, segmento de atuação.</li>
          <li><strong>Pagamento:</strong> chave PIX ou dados bancários informados para o recebimento de comissões.</li>
          <li><strong>Acesso:</strong> senha (guardada apenas na forma de código irreversível), data e hora de acesso, endereço IP e identificação do navegador.</li>
          <li><strong>Contrato:</strong> registros da assinatura eletrônica — data, hora, IP, dispositivo e confirmação por código.</li>
          <li><strong>Relacionamento:</strong> histórico de contatos com a equipe da Credios, indicações feitas e comissões.</li>
        </ul>
        <p>
          <strong>Para que usamos e com qual base legal:</strong> para celebrar e executar o
          contrato de parceria e pagar comissões (execução de contrato); para cumprir
          obrigações fiscais, contábeis e regulatórias (obrigação legal); para proteger o
          Portal contra fraude e acesso indevido e para comprovar a assinatura do contrato
          (legítimo interesse e exercício regular de direitos).
        </p>
      </LegalSection>

      <LegalSection title="2. Dados dos clientes indicados">
        <p>
          Quando você indica um cliente, a Credios recebe os dados que você informa — como
          nome, CPF ou CNPJ, contato, dados do imóvel ou do condomínio, renda e valor de
          crédito desejado — para analisar e intermediar a operação de crédito.
        </p>
        <p>
          Você, parceiro, é responsável por informar o cliente e obter a autorização dele
          antes de compartilhar esses dados. A partir do recebimento, a Credios trata os
          dados como controladora, para atender o pedido de crédito do cliente (procedimentos
          preliminares a contrato, a pedido do titular) e, quando aplicável, para proteção do
          crédito. O atendimento ao cliente segue a Política de Privacidade da Credios.
        </p>
        <p>
          No Portal, você só visualiza um resumo do andamento das suas próprias indicações.
          Documentos, análise de crédito e conversas do cliente com a Credios não são
          exibidos ao parceiro.
        </p>
      </LegalSection>

      <LegalSection title="3. Com quem compartilhamos">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Financiadores</strong> (bancos, fundos e securitizadoras): dados dos clientes indicados, para análise e formalização do crédito.</li>
          <li><strong>Prestadores de serviço</strong> que operam nossa infraestrutura — hospedagem, banco de dados e envio de e-mails —, sob contrato e apenas para essas finalidades. Alguns deles armazenam dados fora do Brasil, com as salvaguardas previstas na LGPD.</li>
          <li><strong>Autoridades</strong>, quando houver obrigação legal ou ordem válida.</li>
        </ul>
        <p>A Credios não vende dados pessoais.</p>
      </LegalSection>

      <LegalSection title="4. Por quanto tempo guardamos">
        <p>
          Dados de cadastro, contrato e comissões são mantidos durante a parceria e, depois
          dela, pelos prazos legais de guarda fiscal e contábil e pelo prazo necessário à
          defesa em eventuais processos. Registros de acesso são mantidos por pelo menos seis
          meses, conforme o Marco Civil da Internet. Dados de clientes indicados seguem os
          prazos da Política de Privacidade da Credios.
        </p>
      </LegalSection>

      <LegalSection title="5. Segurança">
        <p>
          Adotamos medidas como criptografia em trânsito, senhas guardadas de forma
          irreversível, controle de acesso por perfil, registro de auditoria e separação entre
          o acesso de parceiros e o da equipe interna. Nenhum sistema é infalível: se houver
          incidente com risco relevante, comunicaremos os afetados e a ANPD na forma da lei.
        </p>
      </LegalSection>

      <LegalSection title="6. Cookies">
        <p>
          O Portal usa apenas um cookie essencial, que mantém você conectado depois do login.
          Não usamos cookies de publicidade nem de rastreamento no Portal.
        </p>
      </LegalSection>

      <LegalSection title="7. Seus direitos">
        <p>
          Você pode pedir a confirmação do tratamento, o acesso, a correção, a portabilidade,
          a anonimização ou a eliminação de dados, informações sobre compartilhamento e a
          revisão de decisões, nos termos do art. 18 da LGPD. Alguns dados não podem ser
          eliminados enquanto houver obrigação legal de guarda. Você também pode reclamar à
          Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </LegalSection>

      <LegalSection title="8. Contato">
        <p>
          Para exercer seus direitos ou tirar dúvidas sobre este Aviso, fale com o
          encarregado pelo tratamento de dados da Credios pelo e-mail{" "}
          <a href={`mailto:${CREDIOS.emailParcerias}`} className="underline">
            {CREDIOS.emailParcerias}
          </a>
          .
        </p>
      </LegalSection>
    </article>
  );
}
