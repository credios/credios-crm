"use client";

import { Loader2, PlayCircle } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ORIGENS, TIPOS_IMOVEL, UFS } from "@/lib/constants";

type Result = {
  consultorId: string | null;
  consultorNome: string | null;
  regraAplicada: string;
  regraId: string | null;
};

export function RuleTester() {
  const [valorCredito, setValorCredito] = useState("");
  const [valorImovel, setValorImovel] = useState("");
  const [estado, setEstado] = useState("");
  const [origem, setOrigem] = useState("");
  const [tipoImovel, setTipoImovel] = useState("");
  const [forcarHorario, setForcarHorario] = useState(false);
  const [horarioComercial, setHorarioComercial] = useState(true);

  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function testar() {
    setError(null);
    setResult(null);
    setPending(true);
    const body = {
      valorCreditoCentavos: valorCredito ? Math.round(Number(valorCredito) * 100) : null,
      valorImovelCentavos: valorImovel ? Math.round(Number(valorImovel) * 100) : null,
      estado: estado || null,
      origem: origem || null,
      tipoImovel: tipoImovel || null,
      ...(forcarHorario ? { horarioComercial } : {}),
    };
    const res = await fetch("/api/configuracoes/roteamento/testar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : `Erro ${res.status}`);
      return;
    }
    setResult(json as Result);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Testar engine</CardTitle>
        <CardDescription>
          Simule um lead e veja qual regra dispararia. Round-robin roda em dry-run (não avança o ponteiro).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-credito">Valor crédito (R$)</Label>
            <Input
              id="t-credito"
              type="number"
              step="0.01"
              min="0"
              placeholder="350000"
              value={valorCredito}
              onChange={(e) => setValorCredito(e.currentTarget.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-imovel">Valor imóvel (R$)</Label>
            <Input
              id="t-imovel"
              type="number"
              step="0.01"
              min="0"
              placeholder="900000"
              value={valorImovel}
              onChange={(e) => setValorImovel(e.currentTarget.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>UF</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {UFS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Origem</Label>
            <Select value={origem} onValueChange={(v) => setOrigem(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {ORIGENS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de imóvel</Label>
            <Select value={tipoImovel} onValueChange={(v) => setTipoImovel(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_IMOVEL.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <Switch checked={forcarHorario} onCheckedChange={setForcarHorario} />
              Forçar horário comercial
            </Label>
            {forcarHorario && (
              <div className="flex items-center gap-2">
                <Switch checked={horarioComercial} onCheckedChange={setHorarioComercial} />
                <span className="text-sm text-muted-foreground">
                  {horarioComercial ? "Dentro" : "Fora"} do horário
                </span>
              </div>
            )}
          </div>
        </div>

        <Button onClick={testar} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PlayCircle className="size-4" />
          )}
          Testar
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <AlertTitle>
              Regra aplicada: <code>{result.regraAplicada}</code>
            </AlertTitle>
            <AlertDescription>
              {result.consultorId
                ? `→ atribuiria a ${result.consultorNome ?? result.consultorId.slice(0, 8)}`
                : "→ deixaria no pool não-atribuído"}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
