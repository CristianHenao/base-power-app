"""The /v1/report contract (playbook A-02). The web client's types are generated from these models."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Heat = Literal["electric", "gas"]
SourceStatus = Literal["ok", "degraded", "unavailable", "not_connected"]


class ReportRequest(BaseModel):
    """An address, a Texas ZIP, or a county FIPS. The address is never stored."""

    model_config = ConfigDict(extra="forbid")

    address: str | None = Field(default=None, min_length=5, max_length=200)
    county_fips: str | None = Field(default=None, pattern=r"^48\d{3}$")
    zip: str | None = Field(default=None, pattern=r"^\d{5}$")
    heat: Heat | None = None

    @model_validator(mode="after")
    def needs_a_place(self) -> ReportRequest:
        if not self.address and not self.county_fips and not self.zip:
            raise ValueError("send an address, a Texas ZIP, or a Texas county_fips")
        return self


class Utility(BaseModel):
    name: str | None
    eia_utility_id: int | None
    detected_from: Literal["zip", "county"]
    confirmed: bool


class Location(BaseModel):
    county_fips: str
    county: str
    tract_geoid: str | None
    weather_zone: str
    load_zone: str | None
    utility: Utility


class Home(BaseModel):
    profile_type: Literal["RESHIWR", "RESLOWR"]
    label: str


class BaseOffer(BaseModel):
    product: Literal["energy_plus_backup", "energy_only", "backup_program", "none"]
    url: str | None


class Outlook(BaseModel):
    level: int = Field(ge=1, le=5)
    label: Literal["Low", "Moderate", "Elevated", "High", "Very high"]
    long_outages_per_year: float
    interval_90: tuple[float, float]
    once_every_years: float
    years_of_data: float
    since: int
    customers_floored: bool


class Band(BaseModel):
    """[rotate, stay]: the lower and upper per-home bounds, in hours."""

    p50: tuple[float | None, float | None]
    p90: tuple[float | None, float | None]


class Covered(BaseModel):
    homes: float | None
    hours: float | None


class Event(BaseModel):
    id: str
    label: str
    storm: str | None
    start: str
    end: str
    peak_out: int
    peak_out_pct: float | None
    duration_h: Band
    covered: dict[Literal["cores_1", "cores_2"], Covered] | None
    covered_order: Literal["rotate", "stay"] | None
    backup_h: dict[Literal["cores_1", "cores_2"], float | None] | None


class HoursByMonth(BaseModel):
    cores_1: list[float] = Field(min_length=12, max_length=12)
    cores_2: list[float] = Field(min_length=12, max_length=12)


class BackupAssumptions(BaseModel):
    kwh_per_core: float
    kw_per_core: float
    start_soc: float
    mode: Literal["normal"]
    profile_year: int


class Surprise(BaseModel):
    start_soc: float
    hours_by_month: HoursByMonth


class Backup(BaseModel):
    hours_by_month: HoursByMonth
    assumptions: BackupAssumptions
    surprise: Surprise


class Sizing(BaseModel):
    cores: int | None
    reason: str
    share: float | None


class GapSeason(BaseModel):
    season: Literal["winter", "spring", "summer", "fall"]
    outages_per_year: float
    outages_lo: float
    outages_hi: float
    p50_hours: float | None
    p90_hours: float | None
    survival: list[float]


class TypicalHomeGap(BaseModel):
    dark_hours: dict[Literal["none", "one_core", "two_cores", "one_core_reserve", "two_cores_reserve"], float]
    gap_chance: dict[Literal["one_core", "two_cores"], float]
    interval_scale: tuple[float, float]


class HouseholdGap(BaseModel):
    """Expected hours a year this home is dark, and the per-season survival curves on hours_grid."""

    typical_home: TypicalHomeGap
    hours_grid: list[float]
    seasons: list[GapSeason]


class Alert(BaseModel):
    event: str | None
    severity: str | None
    headline: str | None
    ends: str | None


class GridNow(BaseModel):
    """ERCOT conditions from the snapshot worker; the price is for the report's load zone."""

    status: str
    note: str | None
    eea_level: int
    reserves_mw: float
    demand_mw: float | None
    capacity_mw: float | None
    load_zone: str | None
    price_mwh: float | None
    as_of: str
    stale: bool


class Live(BaseModel):
    alerts: list[Alert]
    grid: GridNow | None


class Narrative(BaseModel):
    status: Literal["pending", "ok", "retried", "template"]
    headline: str | None = None
    summary: str | None = None
    fact_ids: list[str] = Field(default_factory=list)
    url: str | None


class Source(BaseModel):
    id: str
    status: SourceStatus
    as_of: str | None = None
    fallback: str | None = None


class Report(BaseModel):
    report_id: str
    location: Location
    home: Home
    base_offer: BaseOffer
    outlook: Outlook
    events: list[Event]
    backup: Backup
    sizing: Sizing
    household_gap: HouseholdGap | None
    live: Live
    narrative: Narrative
    sources: list[Source]
