import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  title: string;
  description?: string;
  fase?: string;
};

export function PagePlaceholder({ title, description, fase }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Em construção</CardTitle>
          <CardDescription>
            Esta tela será implementada {fase ? `na ${fase}` : "em breve"}. O
            esqueleto de auth e navegação já está pronto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Volte mais tarde — ou fale com o time se precisar de algo aqui antes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
