import type { Metadata } from "next";
import Link from "next/link";

import { LegalSection } from "@/components/legal/legal-section";
import { CREDIOS } from "@/lib/portal-parceiro/contrato/modelo";

export const metadata: Metadata = { title: "Termos de Uso" };

const ATUALIZADO_EM = "13 de outubro de 2026";

export default function TermosPortalPage() {
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Termos de Uso do Portal de Parceiros
        </h1>
        <p className="text-sm text-muted-foreground">Última atualização: {ATUALIZADO_EM}</p>
      </header>

      <p>
        Estes Termos regulam o uso do Portal de Parceiros da{" "}
        <strong>{CREDIOS.razaoSocial}</strong>, CNPJ {CREDIOS.cnpj}, com sede na{" "}
        {CREDIOS.endereco} (&quot;Credios&quot;). Ao criar sua senha e acessar o Portal, você
        declara que leu e concorda com estes Termos e com o{" "}
        <Link href="/portal-parceiro/privacidade" className="underline">
          Aviso de Privacidade
        </Link>
        .
      </p>

      <LegalSection title="1. O que é o Portal">
        <p>
          O Portal é a ferramenta pela qual parceiros comerciais da Credios indicam clientes
          interessados em crédito, acompanham o andamento de cada indicação, assinam o
          contrato de parceria e consultam suas comissões.
        </p>
        <p>
          As condições comerciais da parceria — produtos, comissões, prazos e obrigações —
          estão no <strong>Contrato de Parceria Comercial</strong>, assinado eletronicamente
          dentro do Portal. Em caso de divergência entre estes Termos e o Contrato, vale o
          Contrato.
        </p>
      </LegalSection>

      <LegalSection title="2. Acesso e conta">
        <p>
          O acesso é concedido por convite da Credios e é pessoal e intransferível. Você é
          responsável por manter sua senha em sigilo e por toda atividade realizada com o
          seu login. Avise a Credios imediatamente se suspeitar de uso indevido.
        </p>
        <p>
          A Credios pode suspender ou encerrar o acesso em caso de descumprimento destes
          Termos ou do Contrato, de indício de fraude ou de encerramento da parceria. Suas
          indicações e comissões já registradas ficam preservadas.
        </p>
      </LegalSection>

      <LegalSection title="3. Indicação de clientes">
        <p>Ao indicar um cliente, você declara que:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>informou o cliente e obteve a autorização dele para compartilhar os dados com a Credios;</li>
          <li>as informações são verdadeiras, na medida do que o cliente lhe informou;</li>
          <li>não cobrou nem cobrará do cliente qualquer valor pela indicação;</li>
          <li>não prometeu aprovação, taxa, prazo ou condição em nome da Credios ou de financiadores.</li>
        </ul>
        <p>
          Se o cliente já tiver indicação ou atendimento em andamento na Credios, a nova
          indicação não é aceita: prevalece o registro mais antigo. A indicação não garante
          aprovação de crédito — a análise cabe exclusivamente ao financiador.
        </p>
      </LegalSection>

      <LegalSection title="4. Informações exibidas">
        <p>
          O andamento exibido no Portal é um resumo, por etapas, do atendimento feito pela
          Credios. Ele tem caráter informativo e pode ser atualizado ou corrigido. Valores de
          comissão exibidos como previstos só se tornam devidos nas condições do Contrato.
        </p>
      </LegalSection>

      <LegalSection title="5. Uso adequado">
        <p>
          É proibido: compartilhar o acesso com terceiros; tentar acessar dados de outros
          parceiros ou de clientes que você não indicou; usar robôs ou meios automatizados;
          explorar falhas de segurança; ou usar o Portal para finalidade diferente da
          parceria. Falhas encontradas devem ser comunicadas à Credios.
        </p>
      </LegalSection>

      <LegalSection title="6. Assinatura eletrônica">
        <p>
          O Contrato de Parceria é assinado eletronicamente no Portal, com confirmação por
          código enviado ao seu e-mail e registro de data, hora, endereço IP e dispositivo.
          Você reconhece a validade dessa forma de assinatura, nos termos do art. 10, §2º, da
          Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020. A autenticidade de
          qualquer contrato pode ser conferida em{" "}
          <Link href="/portal-parceiro/verificar" className="underline">Verificar contrato</Link>.
        </p>
      </LegalSection>

      <LegalSection title="7. Propriedade intelectual">
        <p>
          O Portal, a marca Credios e seus conteúdos pertencem à Credios. O uso do Portal não
          transfere qualquer direito sobre eles. O uso da marca Credios em materiais do
          parceiro depende de autorização prévia e escrita.
        </p>
      </LegalSection>

      <LegalSection title="8. Disponibilidade e responsabilidade">
        <p>
          A Credios se esforça para manter o Portal disponível e correto, mas ele pode ficar
          indisponível por manutenção ou por fatores fora do nosso controle. Na extensão
          permitida pela lei, a Credios não responde por perdas decorrentes de
          indisponibilidade temporária ou de informações incorretas fornecidas pelo parceiro.
        </p>
      </LegalSection>

      <LegalSection title="9. Alterações">
        <p>
          Estes Termos podem ser atualizados. Mudanças relevantes são comunicadas por e-mail
          ou no próprio Portal, e a data de atualização aparece no topo desta página. O uso
          continuado do Portal após a comunicação representa concordância. Mudanças nas
          condições comerciais só valem mediante novo contrato aceito por você.
        </p>
      </LegalSection>

      <LegalSection title="10. Lei aplicável e foro">
        <p>
          Aplica-se a lei brasileira. Fica eleito o foro da Comarca de Blumenau/SC para
          resolver controvérsias relativas a estes Termos.
        </p>
      </LegalSection>

      <LegalSection title="11. Contato">
        <p>
          Dúvidas sobre o Portal ou sobre a parceria:{" "}
          <a href={`mailto:${CREDIOS.emailParcerias}`} className="underline">
            {CREDIOS.emailParcerias}
          </a>
          .
        </p>
      </LegalSection>
    </article>
  );
}
