# Porchlight API. Build from the repo root: docker build -f api/Dockerfile .
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
COPY pyproject.toml ./
COPY pipeline ./pipeline
# Editable so pipeline.settings resolves data/ under /app, not site-packages.
RUN pip install --no-cache-dir -e ".[api]"
COPY api ./api
COPY data/features.duckdb ./data/features.duckdb
COPY data/processed/zip_utility.csv ./data/processed/zip_utility.csv
COPY data/processed/zip_county.csv ./data/processed/zip_county.csv
COPY public/utility-map/data/utility-map.json ./public/utility-map/data/utility-map.json
COPY data/reference/base_availability.yaml ./data/reference/base_availability.yaml
EXPOSE 8000
CMD ["sh", "-c", "uvicorn api.app.main:app --host 0.0.0.0 --port ${PORT}"]
