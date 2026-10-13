// Contrato de Parceria Comercial — modelo vigente.
//
// v3 (2026-10-13): passa a cobrir os DOIS produtos originados pela Credios —
// crédito com garantia de imóvel e crédito para condomínios — com a comissão
// de cada um. As versões 1 e 2 vivem no portal antigo (credios-parceiros) e
// nos contratos já assinados, que guardam o próprio texto.
//
// NUNCA edite o texto de uma versão já usada: contrato assinado guarda cópia
// do texto (corpo_html), mas a versão identifica o que o parceiro aceitou.
// Mudou cláusula → nova constante, novo número em VERSAO_MODELO.
//
// O gerador de PDF (pdf.ts) entende só <h1>, <h2>, <p> e <strong>.

export const VERSAO_MODELO = 3;

/** Contrato a partir desta versão cobre crédito para condomínios. */
export const VERSAO_MINIMA_CONDOMINIO = 3;

export const CREDIOS = {
  razaoSocial: "Credios Serviços Ltda",
  cnpj: "55.986.282/0001-30",
  endereco: "Rua Ingo Hering, 20, Sala 803, Centro, Blumenau/SC, CEP 89010-205",
  emailParcerias: "parceiros@credios.com.br",
} as const;

/** Comissão de CGI quando o parceiro não tem percentual próprio cadastrado. */
export const COMISSAO_CGI_PADRAO_BPS = 300;
/** Comissão fixa do crédito para condomínios (decisão do owner, 2026-10-13). */
export const COMISSAO_CONDOMINIO_BPS = 300;
export const PRAZO_CGI_DIAS_UTEIS = 10;
export const PRAZO_CONDOMINIO_DIAS_CORRIDOS = 10;

export const CONTRATO_MODELO_V3 = `
<h1>Contrato de Parceria Comercial — Programa de Parceiros Credios</h1>

<p><strong>CONTRATADA:</strong> {{credios.razaoSocial}}, pessoa jurídica de direito privado, inscrita no CNPJ sob nº {{credios.cnpj}}, com sede na {{credios.endereco}}, neste ato representada na forma de seu contrato social ("CREDIOS").</p>

<p><strong>PARCEIRO(A):</strong> {{parceiro.nome}}, inscrito(a) no CPF/CNPJ sob nº {{parceiro.documento}}{{parceiro.representante}}, e-mail {{parceiro.email}}, telefone {{parceiro.telefone}} ("PARCEIRO").</p>

<p>As partes acima qualificadas celebram o presente contrato, que se rege pelas cláusulas a seguir.</p>

<h2>1. Objeto</h2>
<p>1.1. Este contrato tem por objeto a indicação, pelo PARCEIRO, de potenciais clientes interessados em operações de crédito originadas pela CREDIOS, nas seguintes modalidades: (a) <strong>crédito com garantia de imóvel</strong> (home equity); e (b) <strong>crédito para condomínios</strong>.</p>
<p>1.2. O PARCEIRO pode indicar clientes apenas nas modalidades habilitadas em seu cadastro no Portal de Parceiros. A habilitação de cada modalidade é feita pela CREDIOS e pode ser revista a qualquer tempo, sem prejuízo das indicações já registradas.</p>
<p>1.3. A CREDIOS não é instituição financeira e não concede crédito. Atua como correspondente no País, nos termos da Resolução CMN nº 4.935/2021, perante as instituições financeiras parceiras, e como originadora das operações perante os demais financiadores, inclusive fundos de investimento em direitos creditórios e companhias securitizadoras ("Financiador"). A análise e a aprovação de cada operação cabem exclusivamente ao Financiador.</p>
<p>1.4. As indicações são feitas exclusivamente pelo Portal de Parceiros. Considera-se válida a indicação de cliente que, na data do registro, não possua indicação ou atendimento em andamento na CREDIOS. Havendo mais de uma indicação do mesmo cliente, prevalece a registrada primeiro. A indicação encerrada sem operação concluída perde a validade após 90 (noventa) dias do encerramento.</p>

<h2>2. Comissão — crédito com garantia de imóvel</h2>
<p>2.1. Pela indicação que resultar em operação de crédito com garantia de imóvel efetivamente liberada, o PARCEIRO faz jus a comissão de <strong>{{comissao.cgi}}% ({{comissao.cgiExtenso}})</strong> sobre o valor líquido da operação.</p>
<p>2.2. A comissão é devida somente após a liberação efetiva do crédito ao cliente e será paga em até {{comissao.cgiPrazo}} dias úteis contados da liberação.</p>

<h2>3. Comissão — crédito para condomínios</h2>
<p>3.1. Pela indicação que resultar em operação de crédito para condomínio, o PARCEIRO faz jus a comissão fixa de <strong>{{comissao.condominio}}% ({{comissao.condominioExtenso}})</strong> sobre o valor líquido do crédito liberado ao condomínio.</p>
<p>3.2. A comissão será paga em até {{comissao.condominioPrazo}} dias corridos contados da assinatura do contrato de crédito entre o condomínio e o Financiador.</p>
<p>3.3. Se, assinado o contrato de crédito, o crédito não vier a ser liberado ao condomínio, por qualquer motivo, a comissão não será devida, e o valor eventualmente já pago será restituído pelo PARCEIRO ou compensado com comissões futuras.</p>

<h2>4. Regras comuns às comissões</h2>
<p>4.1. Entende-se por valor líquido o montante efetivamente creditado ao cliente pelo Financiador, já deduzidos tributos, tarifas, seguros, custos de registro e demais encargos retidos por ocasião da liberação, bem como valores destinados à quitação de dívidas vinculadas à própria operação.</p>
<p>4.2. Não é devida comissão sobre operações não concluídas, recusadas pelo Financiador ou desistidas pelo cliente, em qualquer estágio.</p>
<p>4.3. O pagamento é feito por transferência à chave PIX ou conta de titularidade do PARCEIRO informada à CREDIOS. Sendo o PARCEIRO pessoa jurídica, o pagamento fica condicionado à emissão da respectiva nota fiscal, e o prazo de pagamento conta-se do recebimento da nota quando este for posterior aos marcos das cláusulas 2.2 e 3.2.</p>
<p>4.4. Cada parte responde pelos tributos incidentes sobre suas próprias receitas. A CREDIOS efetuará as retenções exigidas pela legislação.</p>
<p>4.5. Os percentuais deste contrato valem para as indicações registradas durante sua vigência. Alteração de percentual depende de novo instrumento aceito pelo PARCEIRO e não alcança operações já liberadas ou contratadas.</p>

<h2>5. Obrigações do parceiro</h2>
<p>5.1. O PARCEIRO obriga-se a: (a) prestar informações verdadeiras e completas sobre os clientes indicados; (b) não cobrar nem receber do cliente qualquer valor em razão da indicação ou da operação; (c) não prometer aprovação, taxa, prazo ou condição em nome da CREDIOS ou do Financiador; (d) não usar a marca Credios em material próprio sem autorização prévia e escrita; e (e) informar ao cliente que atua como parceiro indicador, sem poderes de representação.</p>
<p>5.2. O PARCEIRO declara conhecer e cumprir a Lei nº 12.846/2013 (anticorrupção) e a Lei nº 9.613/1998 (prevenção à lavagem de dinheiro), comprometendo-se a não oferecer vantagem indevida a qualquer pessoa e a comunicar à CREDIOS qualquer indício de fraude ou irregularidade de que tenha conhecimento em operação indicada.</p>

<h2>6. Não exclusividade e independência</h2>
<p>6.1. Esta parceria não estabelece exclusividade, vínculo empregatício, societário, de agência ou de representação comercial entre as partes. O PARCEIRO atua com autonomia, por sua conta e risco, sem subordinação, metas ou horário.</p>

<h2>7. Proteção de dados e confidencialidade</h2>
<p>7.1. O PARCEIRO declara que, antes de cada indicação, informou o cliente e obteve sua autorização para compartilhar com a CREDIOS os dados pessoais necessários à análise e à intermediação do crédito, nos termos da Lei nº 13.709/2018 (LGPD), e que guardará comprovação dessa autorização.</p>
<p>7.2. Cada parte é controladora independente dos dados que trata e responde pelo próprio tratamento. A CREDIOS trata os dados dos clientes indicados para a finalidade de análise, intermediação e formalização do crédito, conforme sua Política de Privacidade.</p>
<p>7.3. As partes manterão em sigilo as informações não públicas a que tiverem acesso em razão desta parceria, inclusive após sua extinção, e comunicarão uma à outra, sem demora, qualquer incidente de segurança que envolva dados de clientes indicados.</p>

<h2>8. Vigência e rescisão</h2>
<p>8.1. Este contrato vigora por prazo indeterminado a partir da assinatura eletrônica do PARCEIRO.</p>
<p>8.2. Qualquer das partes pode rescindi-lo a qualquer tempo, mediante notificação escrita, inclusive por e-mail, sem ônus, ressalvado o pagamento das comissões relativas a indicações registradas até a data da rescisão que venham a resultar em operação concluída.</p>
<p>8.3. A CREDIOS pode suspender o acesso do PARCEIRO ao Portal em caso de descumprimento deste contrato ou de indício de fraude, sem prejuízo das comissões já devidas.</p>
<p>8.4. Este instrumento substitui e consolida eventual contrato de parceria anterior entre as partes, preservados os direitos relativos a operações indicadas na vigência do instrumento anterior.</p>

<h2>9. Disposições gerais</h2>
<p>9.1. As partes reconhecem a validade da assinatura eletrônica deste instrumento, nos termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020, e aceitam como prova de autoria e integridade a confirmação por código enviado ao e-mail do signatário e a trilha de auditoria que acompanha o documento.</p>
<p>9.2. A tolerância de uma parte quanto ao descumprimento de qualquer cláusula não implica renúncia nem novação.</p>
<p>9.3. Fica eleito o foro da Comarca de Blumenau/SC para dirimir controvérsias oriundas deste contrato.</p>

<p class="signature-date">Blumenau/SC, {{contrato.data}}.</p>
`;
