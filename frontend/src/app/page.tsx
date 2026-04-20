export const dynamic = "force-dynamic";

import { WorldStage } from "@/components/world-stage";
import { fallbackWorld } from "@/lib/api";
import { listOutsideArtAssets } from "@/lib/outside-art";

export default async function HomePage() {
  const outsideArtAssets = await listOutsideArtAssets();

  return <WorldStage outsideArtAssets={outsideArtAssets} world={fallbackWorld} />;
}
