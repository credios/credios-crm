import type { Metadata } from "next";
import Link from "next/link";

import { LegalSection } from "@/components/legal/legal-section";

export const metadata: Metadata = {
  title: "Exclusão de Dados · Credios",
  description:
    "Como solicitar a exclusão dos seus dados pessoais tratados pela Credios.",
};

const ATUALIZADO_EM = "25 de junho de 2026";

export default function ExclusaoDadosPage() {
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Instruções de Exclusão de Dados
        </h1>
        <p className="text-sm text-muted-foreground">
          Última atualização: {ATUALIZADO_EM}
        </p>
      </header>

      <p>
        Você tem o direito de solicitar a exclusão dos dados pessoais que a{" "}
        <strong>Credios</strong> trata sobre você, nos termos da Lei Geral de
        Proteção de Dados (LGPD). Esta página explica como fazer esse pedido.
      </p>

      <LegalSection title="Como solicitar a exclusão">
        <p>Escolha um dos canais abaixo e informe seu nome completo e o telefone/e-mail que você usou conosco:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>E-mail:</strong>{" "}
            <a
              href="mailto:gabriel.meirelles@credios.com.br?subject=Exclus%C3%A3o%20de%20dados"
              className="underline hover:text-foreground"
            >
              gabriel.meirelles@credios.com.br
            </a>{" "}
            com o assunto “Exclusão de dados”.
          </li>
          <li>
            <strong>WhatsApp:</strong> responda em nossa conversa pedindo a exclusão
            dos seus dados (por exemplo: “Quero excluir meus dados”).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="O que acontece depois">
        <ul className="ml-5 list-disc space-y-1">
          <li>Confirmamos o recebimento do seu pedido e podemos solicitar dados para confirmar sua identidade.</li>
          <li>
            Eliminamos ou anonimizamos seus dados pessoais em nossos sistemas em até{" "}
            <strong>15 dias</strong>, salvo necessidade de prazo adicional, que será
            comunicada a você.
          </li>
          <li>Encerramos o envio de mensagens, inclusive pelo WhatsApp.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Dados que podem ser retidos">
        <p>
          Alguns dados podem ser mantidos quando houver obrigação legal ou
          regulatória de guarda, ou para o exercício regular de direitos em processo
          judicial, administrativo ou arbitral. Nesses casos, os dados ficam restritos
          a essa finalidade e são eliminados ao fim do prazo aplicável.
        </p>
      </LegalSection>

      <LegalSection title="Mais informações">
        <p>
          Para entender quais dados tratamos e com quais finalidades, consulte a
          nossa{" "}
          <Link href="/privacidade" className="underline hover:text-foreground">
            Política de Privacidade
          </Link>
          . Em caso de dúvida, escreva para{" "}
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
