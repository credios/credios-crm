import { type LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
};

export function KpiCard({ label, value, hint, icon: Icon }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          {Icon && <Icon className="size-3.5" />} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <CardDescription className="mt-1 text-xs">{hint}</CardDescription>}
      </CardContent>
    </Card>
  );
}
