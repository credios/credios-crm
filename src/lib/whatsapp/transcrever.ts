import { baixarMidiaWhatsApp } from "@/lib/whatsapp/meta";

// Groq é OpenAI-compatível. whisper-large-v3-turbo: rápido, barato, ótimo PT-BR,
// aceita o OGG/Opus do WhatsApp direto (sem transcodificar).
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

/**
 * Transcreve um áudio (bytes) via Groq Whisper. Retorna o texto ou null em falha
 * (sem GROQ_API_KEY, erro de rede/HTTP). Português forçado (`language: pt`).
 */
export async function transcreverAudio(
  data: ArrayBuffer,
  mime: string,
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.error("[transcrever] GROQ_API_KEY ausente");
    return null;
  }
  try {
    const form = new FormData();
    form.append("file", new Blob([data], { type: mime }), "audio.ogg");
    form.append("model", GROQ_MODEL);
    form.append("language", "pt");
    form.append("response_format", "text");
    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("[transcrever] groq falhou:", resp.status, body.slice(0, 300));
      return null;
    }
    const texto = (await resp.text()).trim();
    return texto || null;
  } catch (e) {
    console.error("[transcrever] erro:", e);
    return null;
  }
}

/**
 * Baixa o áudio do WhatsApp (por media_id) e transcreve. Devolve o texto com um
 * prefixo "🎤" (pra a conversa no CRM mostrar que veio de áudio) ou "" em falha —
 * "" cai no fallback "manda por texto" da Heloísa, sem quebrar nada.
 */
export async function transcreverAudioWhatsapp(mediaId: string): Promise<string> {
  const midia = await baixarMidiaWhatsApp(mediaId);
  if (!midia) return "";
  const texto = await transcreverAudio(midia.data, midia.mime);
  return texto ? `🎤 ${texto}` : "";
}
