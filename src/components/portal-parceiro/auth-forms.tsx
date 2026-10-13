"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Formulários públicos do portal do parceiro (login, convite, senha). Todos
// falam com /api/portal-parceiro/* — nada aqui toca o login dos funcionários.

async function postar(
  url: string,
  body: unknown,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, erro: json.error ?? "Não foi possível concluir. Tente de novo." };
  } catch {
    return { ok: false, erro: "Falha de conexão. Tente de novo." };
  }
}

function Erro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{mensagem}</AlertDescription>
    </Alert>
  );
}

function Enviar({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function LoginForm({ aviso }: { aviso?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setPending(true);
    const r = await postar("/api/portal-parceiro/entrar", { email, senha });
    if (!r.ok) {
      setErro(r.erro);
      setPending(false);
      return;
    }
    router.replace("/portal-parceiro");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {aviso && (
        <Alert>
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}
      <Erro mensagem={erro} />
      <div className="space-y-1.5">
        <Label htmlFor="pp-email">E-mail</Label>
        <Input id="pp-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pp-senha">Senha</Label>
        <Input id="pp-senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} disabled={pending} />
      </div>
      <Enviar pending={pending}>Entrar</Enviar>
      <p className="text-center text-sm">
        <Link href="/portal-parceiro/recuperar-senha" className="text-primary hover:underline">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}

function NovaSenhaCampos({
  senha,
  setSenha,
  confirma,
  setConfirma,
  pending,
}: {
  senha: string;
  setSenha: (v: string) => void;
  confirma: string;
  setConfirma: (v: string) => void;
  pending: boolean;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="pp-nova">Nova senha</Label>
        <Input id="pp-nova" type="password" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} disabled={pending} />
        <p className="text-[11px] text-muted-foreground">
          Pelo menos 10 caracteres, com letras e números.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pp-confirma">Repita a senha</Label>
        <Input id="pp-confirma" type="password" autoComplete="new-password" required value={confirma} onChange={(e) => setConfirma(e.target.value)} disabled={pending} />
      </div>
    </>
  );
}

export function ConviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [termos, setTermos] = useState(false);
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha !== confirma) return setErro("As senhas não conferem.");
    if (!termos) return setErro("Aceite os termos para continuar.");
    setPending(true);
    const r = await postar("/api/portal-parceiro/convite", { token, senha, aceitouTermos: true });
    if (!r.ok) {
      setErro(r.erro);
      setPending(false);
      return;
    }
    router.replace("/portal-parceiro");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Erro mensagem={erro} />
      <NovaSenhaCampos senha={senha} setSenha={setSenha} confirma={confirma} setConfirma={setConfirma} pending={pending} />
      <label className="flex items-start gap-2 text-sm leading-snug cursor-pointer">
        <Checkbox checked={termos} onCheckedChange={(v) => setTermos(v === true)} disabled={pending} className="mt-0.5" />
        <span>
          Li e aceito os{" "}
          <Link href="/termos" target="_blank" className="text-primary hover:underline">termos de uso</Link>{" "}
          e a{" "}
          <Link href="/privacidade" target="_blank" className="text-primary hover:underline">política de privacidade</Link>.
        </span>
      </label>
      <Enviar pending={pending}>Criar senha e entrar</Enviar>
    </form>
  );
}

export function RecuperarForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setPending(true);
    const r = await postar("/api/portal-parceiro/recuperar", { email });
    setPending(false);
    if (!r.ok) return setErro(r.erro);
    setEnviado(true);
  }

  if (enviado) {
    return (
      <Alert>
        <AlertDescription>
          Se este e-mail tiver acesso ao portal, você recebe em instantes um link para
          redefinir a senha. Ele vale por 1 hora.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Erro mensagem={erro} />
      <div className="space-y-1.5">
        <Label htmlFor="pp-rec-email">E-mail</Label>
        <Input id="pp-rec-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
      </div>
      <Enviar pending={pending}>Enviar link</Enviar>
    </form>
  );
}

export function RedefinirForm({ token }: { token: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha !== confirma) return setErro("As senhas não conferem.");
    setPending(true);
    const r = await postar("/api/portal-parceiro/redefinir", { token, senha });
    if (!r.ok) {
      setErro(r.erro);
      setPending(false);
      return;
    }
    router.replace("/portal-parceiro/entrar?senha=ok");
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Erro mensagem={erro} />
      <NovaSenhaCampos senha={senha} setSenha={setSenha} confirma={confirma} setConfirma={setConfirma} pending={pending} />
      <Enviar pending={pending}>Salvar nova senha</Enviar>
    </form>
  );
}

export function TrocarSenhaForm() {
  const [atual, setAtual] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    if (senha !== confirma) return setErro("As senhas não conferem.");
    setPending(true);
    const r = await postar("/api/portal-parceiro/senha", { senhaAtual: atual, novaSenha: senha });
    setPending(false);
    if (!r.ok) return setErro(r.erro);
    setAtual("");
    setSenha("");
    setConfirma("");
    setOk(true);
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-sm" noValidate>
      <Erro mensagem={erro} />
      {ok && (
        <Alert>
          <AlertDescription>Senha alterada. Os outros dispositivos foram desconectados.</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="pp-atual">Senha atual</Label>
        <Input id="pp-atual" type="password" autoComplete="current-password" required value={atual} onChange={(e) => setAtual(e.target.value)} disabled={pending} />
      </div>
      <NovaSenhaCampos senha={senha} setSenha={setSenha} confirma={confirma} setConfirma={setConfirma} pending={pending} />
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Alterar senha
      </Button>
    </form>
  );
}

export function SairButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await postar("/api/portal-parceiro/sair", {});
        router.replace("/portal-parceiro/entrar");
        router.refresh();
      }}
    >
      Sair
    </Button>
  );
}
