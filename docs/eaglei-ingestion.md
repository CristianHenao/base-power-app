# Local EAGLE-I download and cleaning

Run `pipeline/pull_eaglei.py` as a module from the repository root. It downloads
selected annual national CSVs, then streams them into Texas-only observation
Parquet files. This is separate from `pipeline/sources/eaglei.py`, which builds
modeled events and currently makes different missing-interval assumptions.

The script uses pandas, PyArrow, and Python's standard library. It requires no
cloud service or DuckDB. A temporary SQLite file indexes duplicates across chunks
without holding millions of keys in memory. It is removed after successful
conversion. SQLite runs inside Python; there is no database server to start.

The existing project requires Python 3.11. `uv` is already available on this Mac;
the commands below let it prepare the project environment and dependencies.

## Start with one year

Preview selected files and sizes, without writing or downloading CSVs:

```sh
uv run --python 3.11 python -m pipeline.pull_eaglei --years 2025 --dry-run
```

Download, validate, and convert 2025, including the nationwide data-row count
observed in the checksum-matching version-4 file:

```sh
uv run --python 3.11 python -m pipeline.pull_eaglei \
  --years 2025 --expected-rows 30482141
```

The first command only fetches a small metadata record. The second downloads
about 1.40 GB plus three small references. Selecting Texas or particular counties
reduces the output, **not the download**: Figshare serves national annual files.

Already downloaded the annual CSV? Put it at
`data/raw/eaglei/eaglei_outages_2025.csv` and run without network access:

```sh
uv run --python 3.11 python -m pipeline.pull_eaglei \
  --years 2025 --local-only --expected-rows 30482141
```

`--local-only` prevents script network calls; `uv` may still fetch dependencies
on the first invocation. After dependencies are installed, `uv run --offline`
also prevents dependency downloads. A manually supplied CSV gets SHA-256/MD5
provenance, but no claim of verification against Figshare's published checksum
unless it has a matching download manifest produced by the downloader.

## Counties and earlier years

Only Collin, Harris, and Travis counties, in a separate output directory:

```sh
uv run --python 3.11 python -m pipeline.pull_eaglei \
  --years 2025 --county-fips 48085 48201 48453 \
  --output-dir data/processed/outage_observations_demo
```

Add earlier years after successfully processing 2025:

```sh
uv run --python 3.11 python -m pipeline.pull_eaglei --years 2018-2024 --dry-run
uv run --python 3.11 python -m pipeline.pull_eaglei --years 2018-2024
```

The parser supports the documented formats for 2014–2025; every selected file
must still pass its own header/value checks. Use 2018 onward for the proposed
historical analysis window. It does not silently exclude earlier explicitly
requested years.

## What is saved

```text
data/raw/eaglei/
  eaglei_outages_2025.csv
  eaglei_outages_2025.csv.download.json
data/raw/reference/
  MCC.csv
  coverage_history.csv
  DQI.csv
  ...download.json sidecars
data/processed/outage_observations/year=2025/
  observations.parquet
  validation.json
```

References are downloaded unchanged and checksum-verified. They are not required
to clean raw observations and are not converted or joined by this script. MCC's
customer totals and the quality/coverage supplements have their own vintages;
they should not be relabeled as 2025 estimates.

Each Parquet row contains `county_fips` (string), `county_name`, `state_name`,
`observed_at` (UTC timestamp), `customers_out` (nullable int64), and
`observation_status` (`reported` or `missing_unknown`). It records a county
snapshot at collection-run start, not outage onset, household duration, or a
weather polygon. The output is not globally sorted. Consumers must sort by county
and time before event modeling. All provider lineage is in `validation.json`.

## Download identity and formats checked

The default is pinned to Figshare article **24237376, version 4**, rather than
silently following a changing latest release. Files are selected by exact name
and URLs are read from the public API. Each download is checked against published
file size and MD5; SHA-256 is recorded locally. The downloader never overwrites
an existing raw CSV. Complete matching downloads are reused; interrupted downloads
restart rather than resume. Large downloads print progress every 256 MiB.

Live metadata and the first 2 KB of three source files were inspected on
2026-09-26:

| File | Observed count header | Observed timestamp format |
| --- | --- | --- |
| `eaglei_outages_2018.csv` | `customers_out` | `YYYY-MM-DD HH:MM:SS` |
| `eaglei_outages_2023.csv` | `sum` | `YYYY-MM-DD HH:MM:SS` |
| `eaglei_outages_2025.csv` | `customers_out` | `YYYY-MM-DD HH:MM:SS` |

The 2025 README describes `MM/DD/YY HH:MM`; both formats are explicitly accepted
as UTC. Other formats fail validation. The README's `file=42547708` link selects
MCC.csv; the verified 2025 outage CSV file ID is **62164877**. This is why the
script resolves filenames from metadata instead of blindly using the README's
selected-file parameter.

### Corrections established by the full-file run

The downloaded version-4 2025 CSV matches the published size (1,402,347,695 bytes)
and MD5 (`cd2feb1282a42fb048cb6885398bc1cc`), but differs from the README:

- It contains 30,482,141 **data rows**, one fewer than the README's count. Including
  the header gives 30,482,142 lines. The script's `--expected-rows` excludes the
  header and continues to fail on any mismatch; it does not silently subtract one.
- 1,972,650 rows have blank counts, and 1,139,675 rows explicitly report zero.
  These are source records, not generated gap fillers. The original parser's
  positive-only rule rejected them; parser version 2 preserves the distinction.

| Raw count | Stored count | Observation status | Interpretation |
| --- | --- | --- | --- |
| Positive integer | Same integer | `reported` | Source-reported customers out |
| `0` | `0` | `reported` | Source-reported zero, not proof of complete county coverage |
| Empty or whitespace | Parquet null | `missing_unknown` | Source supplied no count; never imputed as zero |
| Negative, fractional, nonfinite, or malformed text | Rejected | No published row | Requires investigation |

Literal strings such as `NaN` and `NULL` are not accepted missing-value codes.
Version 2 adds the status column and bumps `parser_version`; consumers must handle
nullable counts explicitly. Do not pass these records into the existing event
extractor without resolving its missing-data assumptions.

Sources: [Figshare dataset](https://doi.org/10.6084/m9.figshare.24237376.v4),
[public article API](https://api.figshare.com/v2/articles/24237376/versions/4),
[Figshare API documentation](https://docs.figshare.com/v2/).

## Validation and publication

- Exactly the five expected headers, with `sum` permitted for 2023. Header order
  can vary. Unknown, duplicate, or missing headers fail instead of being ignored.
- Every input row is checked, including rows subsequently filtered out. County
  FIPS is structurally checked and zero-padded; `48085.0` is normalized to `48085`.
  Names must be present. Texas name and FIPS prefix must agree. **An authoritative
  county-vintage membership check is not implemented.**
- Nonblank counts must be nonnegative, integral, and fit signed int64. Blank
  counts remain nullable integers marked `missing_unknown`; timestamps must parse
  and belong to the selected source year. Unsupported representations fail.
- Off-grid timestamps are counted and preserved, never rounded. Missing time
  intervals remain absent. No zeros, forward filling, or inferred durations are
  introduced. Absence does not establish absence of an outage.
- Selected observations are deduplicated on `(county_fips, observed_at)` across
  chunks. Matching counts (including null/null) keep one observation; differing
  counts stop the run. A null and a numeric count for the same key are a conflict,
  even when the numeric value is zero. SQL NULL comparison cannot hide that conflict.
  Duplicate checking covers the selected subset, not excluded states/counties.
- The optional expected row count refers to the national source, before filtering.
  It is single-year only. Confirm it against the actual checksum-verified release
  because the 2025 README's count includes one extra row relative to parsed data.
- Parquet metadata is reopened to verify output schema and row count. The manifest
  records row accounting, time bounds, counties found, checksums, parser version,
  duplicate removals, rejects, and source download metadata when available.
  `source_count_quality` tallies positive/zero/unknown among valid national rows
  before filtering; `output_count_quality` tallies published rows after filtering
  and deduplication. `output_quality_by_county` provides the latter breakdown by
  county. `quality_notices` explains retained zeros and unknowns. A passed status
  means the ingestion contract passed, not that the source has complete coverage.

An output partition is published only after validation passes. Existing partitions
are never overwritten: use a new `--output-dir` for a re-run with different filters.
Raw downloads are still reused. A failed run exits nonzero and retains a hidden
staging folder such as `.year-2025-...` with `validation.json` and, for bad values,
`rejected_rows.csv`. A partial Parquet in that staging folder is **not approved
output**. Fix the cause before retrying; inspect and remove failed staging files
manually when they are no longer needed.

For a 24 GB Mac, start with the default 250,000-row chunks. Reduce `--chunk-size`
if necessary. Allow disk space for national raw files, output, and the temporary
duplicate index. The script processes years sequentially. It does not run the
existing event extractor or alter its gap-filling assumptions.

## Verification performed

Automated tests cover filtering, both timestamp formats, 2023's alias, cross-chunk
duplicates/conflicts (including null/zero), missing intervals, nullable output,
quality counts, rejected values, header drift, read-back, row-count mismatch,
file reuse/checksums, and no-network local mode. Run:

```sh
uv run --python 3.11 --extra dev python -m pytest tests/test_pull_eaglei.py -q
```

The initial implementation only used metadata and small source previews. The
subsequent full-file validation exposed the README discrepancies above. A
completed `validation.json` remains the authority for a particular local output;
it records the parser version, input checksums, filters, and quality breakdown.
