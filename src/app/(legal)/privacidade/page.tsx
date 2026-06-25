import type { Metadata } from "next";
import Link from "next/link";

import { LegalSection } from "@/components/legal/legal-section";

export const metadata: Metadata = {
  title: "Política de Privacidade · Credios",
  description:
    "Como a Credios coleta, usa, compartilha e protege seus dados pessoais, em conformidade com a LGPD.",
};

const ATUALIZADO_EM = "25 de junho de 2026";

export default function PrivacidadePage() {
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Política de Privacidade
        </h1>
        <p className="text-sm text-muted-foreground">
          Última atualização: {ATUALIZADO_EM}
        </p>
      </header>

      <p>
        Esta Política de Privacidade descreve como a <strong>Credios</strong>,
        consultoria de crédito imobiliário e correspondente bancário sediada em
        Blumenau/SC (“Credios”, “nós”), coleta, utiliza, compartilha e protege os
        dados pessoais de quem solicita nossos serviços ou interage conosco
        (“você”), em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção
        de Dados — LGPD).
      </p>

      <LegalSection title="1. Dados que coletamos">
        <p>Coletamos os dados que você nos fornece e os necessários à análise da sua operação de crédito, entre eles:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Identificação e contato:</strong> nome, CPF, e-mail, telefone/WhatsApp,
            cidade e estado.
          </li>
          <li>
            <strong>Dados da operação:</strong> objetivo do crédito, valor pretendido,
            tipo e situação do imóvel, valor do imóvel e informações relacionadas.
          </li>
          <li>
            <strong>Dados financeiros e de perfil:</strong> renda, ocupação, estado civil
            e dados do cônjuge/coobrigado, quando aplicável.
          </li>
          <li>
            <strong>Comunicações:</strong> conteúdo das mensagens trocadas conosco,
            inclusive por WhatsApp (texto e notas de voz, que podem ser transcritas).
          </li>
          <li>
            <strong>Dados de origem e navegação:</strong> página de entrada, parâmetros
            de campanha (UTM), identificadores de anúncio (ex.: GCLID), dispositivo e
            referenciador.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Como coletamos">
        <p>
          Coletamos dados quando você preenche o formulário de simulação em nosso
          site, fala conosco pelo WhatsApp ou outros canais, ou quando navega em
          nossas páginas. Mensagens iniciadas por nós no WhatsApp dependem do seu
          opt-in prévio e você pode cancelar a qualquer momento.
        </p>
      </LegalSection>

      <LegalSection title="3. Para que usamos seus dados">
        <ul className="ml-5 list-disc space-y-1">
          <li>Analisar, qualificar e intermediar sua operação de crédito com garantia de imóvel.</li>
          <li>Entrar em contato, tirar dúvidas e conduzir o atendimento.</li>
          <li>Apresentar sua operação a instituições financeiras parceiras em busca das melhores condições.</li>
          <li>Cumprir obrigações legais e regulatórias e prevenir fraudes.</li>
          <li>Melhorar nossos serviços e mensurar nossas ações de marketing.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Bases legais (LGPD)">
        <p>
          Tratamos seus dados com fundamento no consentimento, na execução de
          procedimentos preliminares e de contrato a seu pedido, no cumprimento de
          obrigação legal/regulatória e no legítimo interesse para a prestação e o
          aprimoramento dos serviços, sempre respeitando seus direitos.
        </p>
      </LegalSection>

      <LegalSection title="5. Com quem compartilhamos">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Instituições financeiras parceiras</strong> (bancos e fintechs), para
            análise e apresentação de propostas de crédito.
          </li>
          <li>
            <strong>Provedores de tecnologia</strong> que viabilizam nossa operação, como
            serviços de hospedagem, banco de dados, e-mail e a plataforma do WhatsApp
            (Meta Platforms), atuando como operadores sob nossas instruções.
          </li>
          <li>
            <strong>Autoridades</strong>, quando exigido por lei ou ordem judicial.
          </li>
        </ul>
        <p>Não vendemos seus dados pessoais.</p>
      </LegalSection>

      <LegalSection title="6. WhatsApp">
        <p>
          Utilizamos a WhatsApp Business Platform (Meta) para atendimento e
          qualificação. As mensagens trocadas são registradas em nossos sistemas
          para conduzir o atendimento. Você pode encerrar a comunicação por esse
          canal a qualquer momento respondendo que não deseja mais ser contatado.
        </p>
      </LegalSection>

      <LegalSection title="7. Retenção">
        <p>
          Mantemos seus dados pelo tempo necessário às finalidades aqui descritas e
          ao cumprimento de obrigações legais e regulatórias. Encerradas essas
          hipóteses, os dados são eliminados ou anonimizados.
        </p>
      </LegalSection>

      <LegalSection title="8. Segurança">
        <p>
          Adotamos medidas técnicas e organizacionais para proteger seus dados
          contra acessos não autorizados e situações de perda, alteração ou
          divulgação indevida, incluindo controle de acesso e registros de auditoria.
        </p>
      </LegalSection>

      <LegalSection title="9. Seus direitos">
        <p>Nos termos da LGPD, você pode solicitar, a qualquer momento:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>confirmação da existência de tratamento e acesso aos dados;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários;</li>
          <li>portabilidade e informação sobre compartilhamentos;</li>
          <li>revogação do consentimento e exclusão dos dados tratados com base nele.</li>
        </ul>
        <p>
          Para exercer seus direitos ou excluir seus dados, consulte nossas{" "}
          <Link href="/exclusao-de-dados" className="underline hover:text-foreground">
            instruções de exclusão de dados
          </Link>{" "}
          ou escreva para o contato abaixo.
        </p>
      </LegalSection>

      <LegalSection title="10. Contato">
        <p>
          Dúvidas ou solicitações sobre privacidade e proteção de dados:{" "}
          <a
            href="mailto:gabriel.meirelles@credios.com.br"
            className="underline hover:text-foreground"
          >
            gabriel.meirelles@credios.com.br
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="11. Alterações">
        <p>
          Podemos atualizar esta Política periodicamente. A versão vigente é sempre
          a publicada nesta página, com a data de última atualização indicada no topo.
        </p>
      </LegalSection>
    </article>
  );
}
