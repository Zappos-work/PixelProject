import { WorldStage } from "@/components/world-stage";
import { fallbackWorld } from "@/lib/api";

export default function HomePage() {
  return <WorldStage world={fallbackWorld} />;
}
