define(["jquery"], function ($) {
  "use strict";

  /**
   * Widget Credios — ponte do Salesbot pro cérebro de atendimento WhatsApp.
   *
   * Único papel: aparecer como um passo no designer do Salesbot e, ao salvar o
   * fluxo, gerar o handler `widget_request` que faz POST no nosso endpoint
   * (/api/kommo/brain) passando o telefone do contato e a mensagem. O nosso
   * servidor responde no return_url com o texto a ser injetado no WhatsApp.
   */
  var CrediosWidget = function () {
    var self = this;
    var DEFAULT_URL = "https://crm.credios.com.br/api/kommo/brain";

    function brainUrl() {
      try {
        var s = self.get_settings ? self.get_settings() : {};
        return (s && s.url) || DEFAULT_URL;
      } catch (e) {
        return DEFAULT_URL;
      }
    }

    this.callbacks = {
      settings: function () {},
      init: function () {
        return true;
      },
      bind_actions: function () {
        return true;
      },
      render: function () {
        return true;
      },
      dpSettings: function () {},
      advancedSettings: function () {},
      destroy: function () {},
      contacts: { selected: function () {} },
      leads: { selected: function () {} },
      onSave: function () {
        return true;
      },

      /** Aparência do bloco e saídas possíveis no designer do Salesbot. */
      salesbotDesignerSettings: function () {
        return {
          name: "Atendimento Credios (IA)",
          color: "#4b7be5",
          exits: [{ code: "success", title: "OK" }],
        };
      },

      /**
       * Chamado ao salvar o fluxo. Retorna o JSON do passo widget_request
       * apontando pro cérebro, passando telefone do contato + texto da mensagem.
       *
       * Formato canônico do Kommo: o handler vai DENTRO de um bloco `question`
       * (não `execute_handler` — esse é só pra resposta do return_url). Sem o
       * wrapper certo o Kommo ignora o passo e nunca dispara o POST.
       */
      onSalesbotDesignerSave: function (handler_code, params) {
        var url = (params && params.url) || brainUrl();
        return JSON.stringify([
          {
            question: [
              {
                handler: "widget_request",
                params: {
                  url: url,
                  data: {
                    phone: "{{contact.phone}}",
                    message: "{{message_text}}",
                  },
                },
              },
            ],
          },
        ]);
      },
    };

    return this;
  };

  return CrediosWidget;
});
