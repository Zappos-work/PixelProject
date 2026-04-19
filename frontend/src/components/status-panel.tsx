import type { DashboardData } from "@/lib/api";

type StatusPanelProps = {
  data: DashboardData;
};

function statusLabel(isUp: boolean): string {
  return isUp ? "Online" : "Waiting";
}

export function StatusPanel({ data }: StatusPanelProps) {
  const services = [
    {
      name: "API",
      up: data.health.service_status.api,
      detail: "FastAPI foundation and local routing",
    },
    {
      name: "Database",
      up: data.health.service_status.database,
      detail: "PostgreSQL connection and initial schema bootstrap",
    },
    {
      name: "Redis",
      up: data.health.service_status.redis,
      detail: "Cache and realtime groundwork for chunk subscriptions",
    },
  ];

  return (
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Local Status</p>
        <h2>Foundation services</h2>
      </div>

      <div className="status-grid">
        {services.map((service) => (
          <article className="status-card" key={service.name}>
            <div className="status-heading">
              <span>{service.name}</span>
              <span className={service.up ? "pill pill-up" : "pill pill-warn"}>
                {statusLabel(service.up)}
              </span>
            </div>
            <p>{service.detail}</p>
          </article>
        ))}
      </div>

      <div className="world-summary">
        <div>
          <p className="summary-label">World origin</p>
          <p className="summary-value">
            {data.world.origin.x}:{data.world.origin.y}
          </p>
        </div>
        <div>
          <p className="summary-label">Chunk size</p>
          <p className="summary-value">{data.world.chunk_size} x {data.world.chunk_size}</p>
        </div>
        <div>
          <p className="summary-label">Expansion buffer</p>
          <p className="summary-value">{data.world.expansion_buffer} px</p>
        </div>
        <div>
          <p className="summary-label">Seeded chunks</p>
          <p className="summary-value">{data.world.chunk_count}</p>
        </div>
        <div>
          <p className="summary-label">World span</p>
          <p className="summary-value">
            {data.world.bounds.min_chunk_x} to {data.world.bounds.max_chunk_x}
          </p>
        </div>
      </div>
    </section>
  );
}
