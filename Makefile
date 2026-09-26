# Porchlight data pipeline. `make data` rebuilds every derived file from public sources.
# First time: uv venv -p 3.11 .venv && uv pip install -p .venv -e ".[dev,data]"

PY ?= .venv/bin/python

.PHONY: data download build test

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
	$(PY) -m pipeline.grid_value
	$(PY) -m pipeline.insights
	$(PY) -m pipeline.features
	$(PY) -m pipeline.sources.eia861
	$(PY) -m pipeline.sources.zip_utility
	$(PY) -m pipeline.map_layers

test:
	$(PY) -m pytest -q
