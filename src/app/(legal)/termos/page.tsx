import type { Metadata } from "next";
import Link from "next/link";

import { LegalSection } from "@/components/legal/legal-section";

export const metadata: Metadata = {
  title: "Termos de Serviço · Credios",
  description:
    "Termos e condições de uso dos serviços de intermediação de crédito da Credios.",
};

const ATUALIZADO_EM = "25 de junho de 2026";

export default function TermosPage() {
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Termos de Serviço
        </h1>
        <p className="text-sm text-muted-foreground">
          Última atualização: {ATUALIZADO_EM}
        </p>
      </header>

      <p>
        Estes Termos de Serviço regem a utilização dos serviços oferecidos pela{" "}
        <strong>Credios</strong>, consultoria de crédito imobiliário e
        correspondente bancário sediada em Blumenau/SC. Ao solicitar uma
        simulação, falar conosco ou utilizar nossos canais de atendimento, você
        declara estar de acordo com estes Termos.
      </p>

      <LegalSection title="1. O que fazemos">
        <p>
          A Credios é uma consultoria especializada em Crédito com Garantia de
          Imóvel (home equity). Atuamos como intermediária entre você e
          instituições financeiras parceiras, buscando apresentar as melhores
          condições disponíveis para o seu caso. <strong>Nosso serviço não tem
          custo para você</strong>: somos remunerados pelas instituições em caso de
          contratação.
        </p>
      </LegalSection>

      <LegalSection title="2. Sem garantia de aprovação">
        <p>
          A simulação e o atendimento têm caráter informativo e não constituem
          oferta ou promessa de crédito. A aprovação, as taxas, os prazos e as
          condições finais dependem exclusivamente da análise das instituições
          financeiras e podem variar. Nenhuma condição é garantida até a efetiva
          contratação com a instituição.
        </p>
      </LegalSection>

      <LegalSection title="3. Suas responsabilidades">
        <ul className="ml-5 list-disc space-y-1">
          <li>Fornecer informações verdadeiras, completas e atualizadas.</li>
          <li>Enviar documentos legítimos e de sua titularidade (ou devidamente autorizados).</li>
          <li>Não utilizar nossos canais para fins ilícitos, fraudulentos ou abusivos.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Comunicação por WhatsApp e e-mail">
        <p>
          Ao informar seu contato, você concorda em receber mensagens relacionadas
          ao seu atendimento por WhatsApp, e-mail ou telefone. Você pode pedir o
          encerramento da comunicação a qualquer momento, respondendo que não deseja
          mais ser contatado.
        </p>
      </LegalSection>

      <LegalSection title="5. Privacidade e proteção de dados">
        <p>
          O tratamento dos seus dados pessoais é descrito na nossa{" "}
          <Link href="/privacidade" className="underline hover:text-foreground">
            Política de Privacidade
          </Link>
          . Você pode solicitar a exclusão dos seus dados conforme as{" "}
          <Link href="/exclusao-de-dados" className="underline hover:text-foreground">
            instruções de exclusão de dados
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="6. Propriedade intelectual">
        <p>
          As marcas, conteúdos e materiais disponibilizados pela Credios são
          protegidos e não podem ser copiados ou utilizados sem autorização prévia.
        </p>
      </LegalSection>

      <LegalSection title="7. Limitação de responsabilidade">
        <p>
          A Credios não se responsabiliza por decisões tomadas pelas instituições
          financeiras nem por indisponibilidades temporárias de canais de terceiros
          (como a plataforma do WhatsApp). Empregamos esforços razoáveis para manter
          a qualidade e a continuidade do atendimento.
        </p>
      </LegalSection>

      <LegalSection title="8. Alterações destes Termos">
        <p>
          Podemos atualizar estes Termos periodicamente. A versão vigente é sempre a
          publicada nesta página, com a data de última atualização indicada no topo.
        </p>
      </LegalSection>

      <LegalSection title="9. Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da
          comarca de Blumenau/SC para dirimir eventuais controvérsias, salvo
          disposição legal em contrário aplicável a relações de consumo.
        </p>
      </LegalSection>

      <LegalSection title="10. Contato">
        <p>
          Dúvidas sobre estes Termos:{" "}
          <a
            href="mailto:gabriel.meirelles@credios.com.br"
            className="underline hover:text-foreground"
          >
            gabriel.meirelles@credios.com.br
          </a>
          .
        </p>
      </LegalSection>
    </article>
  );
}
