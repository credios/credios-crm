import { subDays } from "date-fns";
import { redirect } from "next/navigation";

import { GoogleAdsClient } from "@/components/relatorios/google-ads-client";
import { getAppUser } from "@/lib/auth/get-app-user";
import { listLeadsGoogleAds } from "@/lib/leads/list-leads-google-ads";
import type { LeadRow } from "@/lib/leads/list-leads";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function GoogleAdsPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");

  const to = new Date();
  const from = subDays(to, 90);

  const rows = await listLeadsGoogleAds(user, { from, to });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria Google Ads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Leads de origem Google nos últimos 90 dias. Cap defensivo de 500 leads.
        </p>
      </div>
      <GoogleAdsClient leads={rows as unknown as LeadRow[]} />
    </div>
  );
}
