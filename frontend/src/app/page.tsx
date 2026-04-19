import { StatusPanel } from "@/components/status-panel";
import { WorldStage } from "@/components/world-stage";
import { getDashboardData } from "@/lib/api";

export const dynamic = "force-dynamic";

const confirmedDecisions = [
  "The world starts from a clear origin at 0:0 and grows outwards on defined axes.",
  "Chunks are currently configured as 5,000 x 5,000 regions for the first technical foundation.",
  "A 5,000 pixel expansion buffer is reserved so the next chunk can be added before players hit the visible border.",
  "The backend now seeds a visible starter chunk ring so the world is readable from the first local boot.",
];

const plannedModules = [
  "Authentication, users, holders and claims are separated in the backend package layout.",
  "Canvas, chunks, overlays and realtime will build on Redis-backed subscriptions and chunk-aware APIs.",
  "Moderation, reports and audit trails are reserved as dedicated modules instead of being scattered into UI code.",
];

const nextFocus = [
  "Define exact claim validity rules, especially connectivity and the very first player claim workflow.",
  "Decide how realtime chunk subscriptions should batch updates under higher load.",
  "Specify holder balancing, coin rewards and overlay conversion rules before gameplay logic gets deep.",
];

export default async function HomePage() {
  const dashboard = await getDashboardData();
  const publicApiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
  const backendDocsUrl = publicApiBaseUrl.replace("/api/v1", "/docs");

  return (
    <main className="page-shell">
      <section className="hero panel">
        <p className="eyebrow">PixelProject</p>
        <h1>The world has a visible first shape now</h1>
        <p className="hero-copy">
          The project now boots into a real starter world with seeded chunks around the origin,
          visible landmarks and a frontend map that already feels like the first layer of a living
          canvas game.
        </p>
        <div className="hero-links">
          <a href={backendDocsUrl} target="_blank" rel="noreferrer">
            Backend docs
          </a>
          <a href={`${publicApiBaseUrl}/world/overview`} target="_blank" rel="noreferrer">
            World overview
          </a>
        </div>
      </section>

      <WorldStage world={dashboard.world} />

      <StatusPanel data={dashboard} />

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <p className="eyebrow">Confirmed</p>
            <h2>Current decisions</h2>
          </div>
          <ul className="bullet-list">
            {confirmedDecisions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header">
            <p className="eyebrow">Structure</p>
            <h2>Implementation lanes</h2>
          </div>
          <ul className="bullet-list">
            {plannedModules.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header">
            <p className="eyebrow">Tracking</p>
            <h2>Project state files</h2>
          </div>
          <ul className="bullet-list">
            {[
              "README.md keeps the product vision, roadmap and high-level technical direction.",
              "docs/project-foundation.md stores the confirmed architectural decisions.",
              "docs/project-status.md tracks what is actually implemented locally right now.",
            ].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header">
            <p className="eyebrow">Next</p>
            <h2>Best next questions</h2>
          </div>
          <ul className="bullet-list">
            {nextFocus.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
