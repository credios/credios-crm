// scripts/gerar-refresh-token.ts
// ----------------------------------------------------------------------------
// Helper que roda UMA vez, localmente, para gerar o GADS_REFRESH_TOKEN.
//
// Pré-requisitos:
//   - A conta Google usada no login precisa ser "usuário de teste" da tela de
//     consentimento OAuth (modo Teste) e ter acesso ao Google Ads da Credios.
//   - GADS_CLIENT_ID e GADS_CLIENT_SECRET em mãos (Cloud Console).
//
// Uso:
//   GADS_CLIENT_ID=... GADS_CLIENT_SECRET=... npx tsx scripts/gerar-refresh-token.ts
//
// Abre o navegador → você autoriza → o token é impresso no terminal.
// Copie o valor pra GADS_REFRESH_TOKEN no .env.local (e no gerenciador de
// segredos do deploy). O refresh token não expira enquanto for usado.
// ----------------------------------------------------------------------------
import { exec } from "node:child_process";
import http from "node:http";

const CLIENT_ID = process.env.GADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GADS_CLIENT_SECRET;
const REDIRECT = "http://localhost:53682";
// datamanager: upload de conversões (Data Manager API — via runtime do CRM).
// adwords: gestão de ações de conversão via Google Ads API (setup/diagnóstico).
const SCOPE =
  "https://www.googleapis.com/auth/datamanager https://www.googleapis.com/auth/adwords";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Faltam GADS_CLIENT_ID e/ou GADS_CLIENT_SECRET no ambiente.\n" +
      "Uso: GADS_CLIENT_ID=... GADS_CLIENT_SECRET=... npx tsx scripts/gerar-refresh-token.ts",
  );
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // força emitir refresh_token
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, REDIRECT);
  const code = url.searchParams.get("code");
  if (!code) {
    res.end("Sem code.");
    return;
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  const data = (await tokenRes.json()) as { refresh_token?: string };
  console.log("\n=== COPIE ESTE REFRESH TOKEN ===\n", data.refresh_token, "\n");
  res.end("OK, pode fechar esta aba. Veja o terminal.");
  server.close();
});

server.listen(53682, () => {
  console.log("Abra a URL abaixo, autorize, e volte ao terminal:\n", authUrl);
  const open =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${open} "${authUrl}"`);
});
