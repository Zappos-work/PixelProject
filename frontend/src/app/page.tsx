import { WorldStage } from "@/components/world-stage";
import { getDashboardData } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const dashboard = await getDashboardData();

  return <WorldStage world={dashboard.world} />;
}
