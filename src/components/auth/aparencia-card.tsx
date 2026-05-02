/* eslint-disable react-hooks/set-state-in-effect */
// Effects abaixo escutam o sistema (matchMedia) e leem localStorage no mount —
// padrão correto pra "hydration de preferência" mas o lint não distingue.
"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Density = "compact" | "comfortable" | "spacious";
type Theme = "auto" | "light" | "dark";

const DENSITY_KEY = "credios:density";
const THEME_KEY = "credios:theme";
const REDUCE_MOTION_KEY = "credios:reduce-motion";
const COMPACT_NUMBERS_KEY = "credios:compact-numbers";

function applyDensity(d: Density) {
  const html = document.documentElement;
  html.classList.remove("dens-compact", "dens-comfortable", "dens-spacious");
  html.classList.add(`dens-${d}`);
}

function applyTheme(t: Theme) {
  const html = document.documentElement;
  let dark = t === "dark";
  if (t === "auto") {
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  html.classList.toggle("dark", dark);
}

function applyReduceMotion(on: boolean) {
  document.documentElement.classList.toggle("reduce-motion", on);
}

function applyCompactNumbers(on: boolean) {
  document.documentElement.classList.toggle("compact-numbers", on);
}

export function AparenciaCard() {
  const [density, setDensity] = useState<Density>("comfortable");
  const [theme, setTheme] = useState<Theme>("auto");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [compactNumbers, setCompactNumbers] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const d = (localStorage.getItem(DENSITY_KEY) as Density | null) ?? "comfortable";
    const t = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "auto";
    const rm = localStorage.getItem(REDUCE_MOTION_KEY) === "true";
    const cn = localStorage.getItem(COMPACT_NUMBERS_KEY) !== "false";
    setDensity(d);
    setTheme(t);
    setReduceMotion(rm);
    setCompactNumbers(cn);
    setHydrated(true);
    applyDensity(d);
    applyTheme(t);
    applyReduceMotion(rm);
    applyCompactNumbers(cn);
  }, []);

  // Reage a mudança do sistema quando theme=auto.
  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("auto");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  function changeDensity(d: Density) {
    setDensity(d);
    localStorage.setItem(DENSITY_KEY, d);
    applyDensity(d);
  }

  function changeTheme(t: Theme) {
    setTheme(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }

  function changeReduceMotion(v: boolean) {
    setReduceMotion(v);
    localStorage.setItem(REDUCE_MOTION_KEY, String(v));
    applyReduceMotion(v);
  }

  function changeCompactNumbers(v: boolean) {
    setCompactNumbers(v);
    localStorage.setItem(COMPACT_NUMBERS_KEY, String(v));
    applyCompactNumbers(v);
  }

  if (!hydrated) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
          <CardDescription>Carregando preferências…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Aparência</CardTitle>
        <CardDescription>
          Preferências visuais salvas neste navegador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
            Densidade
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {(["compact", "comfortable", "spacious"] as Density[]).map((d) => {
              const active = density === d;
              const labels = {
                compact: "Compacto",
                comfortable: "Confortável",
                spacious: "Amplo",
              } as const;
              const desc = {
                compact: "Linhas 32px · power user",
                comfortable: "Padrão · 40px",
                spacious: "Linhas 48px · respiro",
              } as const;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => changeDensity(d)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left transition-all duration-fast",
                    active
                      ? "border-primary bg-primary/8 ring-2 ring-primary/30"
                      : "border-border hover:bg-foreground/3",
                  )}
                  aria-pressed={active}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{labels[d]}</span>
                    {active && <Check className="size-3.5 text-primary" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {desc[d]}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
            Tema
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { v: "auto" as const, label: "Sistema", icon: Monitor },
                { v: "light" as const, label: "Claro", icon: Sun },
                { v: "dark" as const, label: "Escuro", icon: Moon },
              ]
            ).map(({ v, label, icon: Icon }) => {
              const active = theme === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => changeTheme(v)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all duration-fast",
                    active
                      ? "border-primary bg-primary/8 ring-2 ring-primary/30 font-medium"
                      : "border-border hover:bg-foreground/3",
                  )}
                  aria-pressed={active}
                >
                  <Icon className="size-3.5" strokeWidth={1.75} /> {label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Reduzir movimento</p>
              <p className="text-xs text-muted-foreground">
                Desativa stagger e transições. Padrão segue a configuração do
                sistema.
              </p>
            </div>
            <Switch
              checked={reduceMotion}
              onCheckedChange={changeReduceMotion}
              aria-label="Reduzir movimento"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Compactar números grandes</p>
              <p className="text-xs text-muted-foreground">
                R$ 350K em vez de R$ 350.000.
              </p>
            </div>
            <Switch
              checked={compactNumbers}
              onCheckedChange={changeCompactNumbers}
              aria-label="Compactar números"
            />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
