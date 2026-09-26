# Porchlight data pipeline. `make data` rebuilds every derived file from public sources.
# First time: uv venv -p 3.11 .venv && uv pip install -p .venv -e ".[dev,data]"

PY ?= .venv/bin/python

.PHONY: data download build check test api demo loadtest

data: download build

# Raw inputs into data/raw (skips files already there). Add PTC=1 to refresh ZIP -> wires company (~15 min).
download:
	$(PY) -m pipeline.download $(if $(PTC),--with-ptc,)
	$(PY) -m pipeline.sources.ercot_prices

# Order matters: each step reads what the one before it wrote.
build:
	$(PY) -m pipeline.sources.eaglei_texas
	$(PY) -m pipeline.sources.crosswalk
	$(PY) -m pipeline.backtest
	$(PY) -m pipeline.storms
	$(PY) -m pipeline.grid_value
	$(PY) -m pipeline.insights
	$(PY) -m pipeline.sources.eaglei
	$(PY) -m pipeline.features
	$(PY) -m pipeline.statewide
	$(PY) -m pipeline.durations
	$(PY) -m pipeline.household_gap
	$(PY) -m pipeline.sources.eia861
	$(PY) -m pipeline.sources.zip_utility
	$(PY) -m pipeline.map_layers
	$(PY) -m pipeline.pays_twice
	$(PY) -m pipeline.sources.eia861_reliability
	$(PY) -m pipeline.reports
	$(PY) -m pipeline.charts

# Recompute every persona number from raw data; writes docs/persona-check.md.
check:
	$(PY) -m pipeline.persona_check

test:
	$(PY) -m pytest -q

# The FastAPI service on :8000. Loads XAI_API_KEY from .env when present; PORCHLIGHT_DEBUG=1 enables fault injection.
api:
	set -a; [ -f .env ] && . ./.env; set +a; PORCHLIGHT_DEBUG=$${PORCHLIGHT_DEBUG:-1} $(PY) -m uvicorn api.app.main:app --port 8000

# Everything in containers from a clean clone: API on :4000, web on :3000.
demo:
	docker compose up --build --wait

# Latency table against a running API (make api in another terminal).
loadtest:
	$(PY) -m api.loadtest --url http://localhost:8000 --requests 300 --concurrency 20
