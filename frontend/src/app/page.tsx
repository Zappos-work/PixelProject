export const dynamic = "force-dynamic";

import { WorldStage } from "@/components/world-stage";
import { getDashboardData } from "@/lib/api";
import { listOutsideArtAssets } from "@/lib/outside-art";

export default async function HomePage() {
  const [outsideArtAssets, dashboardData] = await Promise.all([
    listOutsideArtAssets(),
    getDashboardData(),
  ]);

  return <WorldStage outsideArtAssets={outsideArtAssets} world={dashboardData.world} />;
}
