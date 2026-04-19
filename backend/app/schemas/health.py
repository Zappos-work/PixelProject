from pydantic import BaseModel


class ServiceStatus(BaseModel):
    api: bool
    database: bool
    redis: bool


class HealthResponse(BaseModel):
    status: str
    environment: str
    service_status: ServiceStatus

