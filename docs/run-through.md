# Demo run-through checklist (7 PM gate)

For whoever drives the timed run-through and the recording. Numbers below come from the live API at
5:05 PM Saturday, and a scripted dry run at 5:20 PM matched every one; they are estimates and can
shift if the pipeline is rebuilt.

## Before you start (10 minutes)
1. `git pull` on main.
2. Terminal 1: `make api`. It loads `XAI_API_KEY` from `.env` (without it, the summary uses the
   template and the chip says so) and turns on the fault switch. Check `curl localhost:8000/health`.
3. Terminal 2: `npx next dev`. You need `.env.local` with the Supabase keys, and you must be signed in.
4. Browser: sign in, then open `localhost:3000/report`. Run each persona once off camera. A first
   report takes about 1 s and its summary 3-5 s (Grok). After that everything is cached: a repeat
   report loads in about 0.1 s and its summary in about 0.4 s.
5. Alternative with no local Python: `docker compose up --build --wait` serves the web app on :3000
   and the API on :4000 (about a minute to build).

## The three homes
Streets are made up (no real address is stored anywhere); the ZIP places the county, so the
"Address" chip reads "degraded (zip)". That is expected; say "we only need the ZIP" if asked.

| Persona | Type this | Heat | What the report should show |
|---|---|---|---|
| Sally, Plano | `1200 Juniper Hollow Ln, Plano, TX 75025` | Electric | Collin, Oncor. Elevated, 12h+ outage about once every 10 years. Top storm: Uri, 35% of homes out, 90% back within 42-73 h; one Core lasted about 9 h that week. February 28 h vs August 17 h on one Core. 2 Cores. Backup gap: 5.9 h a year with no backup, 1.7 h with one Core, 1.1 h with two |
| Thomas, west Houston | `4400 Cypress Bend Dr, Houston, TX 77084` | Gas | Harris, CenterPoint. High, about once every 5 years. Top storm: Hurricane Beryl, 91% out, 90% back within 115-175 h; one Core lasted about 20 h that week. February 41 h vs August 15 h. 2 Cores. Backup gap: 14.2 h, 8.1 h, 6.4 h; 12% chance a year of an outage longer than one Core lasts |
| South Austin | `800 Live Oak Bluff, Austin, TX 78745` | Gas | Travis, Austin Energy (backup program, no energy plan). Elevated, about once every 10 years. Top storm: Uri, 43% out, 90% back within 67-96 h. The 2023 ice storm is next. 2 Cores. Backup gap: 5.5 h, 1.1 h, 0.4 h |

## The household answer (the part to linger on)
On Thomas's report, "Answer for my appliances" starts with the essentials, central AC and heating
that matches the home, with the fridge starred. Star the CPAP machine. "Everything checked" should
read about 6 hours a year on one Core, and "Starred only" (fridge and CPAP) about 16 minutes. Say:
the appliance list never leaves the phone. Sally's default is about 1.7 hours, the same as her
typical-home tile.

## Failure clip (Victor's "kill it mid-demo" shot)
With the report open:
```
curl -X POST localhost:8000/v1/debug/faults -H 'content-type: application/json' -d '{"nws": true, "llm": true, "ercot": true}'
```
Run the report again: it still renders. The chips read "Weather alerts: degraded",
"Grid now: degraded", and, once the summary finishes, "Summary: degraded (template)", and the
summary is the template.
Turn everything back on:
```
curl -X POST localhost:8000/v1/debug/faults -H 'content-type: application/json' -d '{}'
```

## If something breaks live
- **The Python API is down, or you are on the deployed site:** the three persona addresses still load their
  saved reports (built by `python -m pipeline.reports`), with the chip "Live data: unavailable (saved report)".
  Other addresses need the API.
- **No network:** Census, NWS, ERCOT and Grok all degrade, and the report still renders from
  `features.duckdb`. Type a county instead of an address only through the API
  (`{"county_fips": "48201"}`); the page needs an address with a Texas ZIP.
- **"We could not find that address":** the text had no Texas ZIP. Add the ZIP.
- **The page redirects to sign-in:** you are signed out. Sign in again.
- **You rebuilt the data:** stop `make api` first. It holds a read lock on `data/features.duckdb`.

## Numbers to have ready for questions
- Outlook backtest, 2023-24: deviance 122 against 126 for the weather-zone mean; rank correlation 0.42.
- Duration model backtest: log-likelihood per home -2.56, against -2.65 without severity and -3.05 pooled.
- API load test: county report p95 82 ms at 20 concurrent, 0 errors in 900 requests.
- Narrator: Grok's first reply passes the checks 88-100% of the time, and 96-100% after one
  retry; anything else falls back to the template.
- Official reliability drops 66-92% of outage minutes by leaving out major event days (EIA-861, 2019-24).
