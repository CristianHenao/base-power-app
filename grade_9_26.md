# Porchlight review, Saturday Sep 26

A review of Porchlight from the seat of a Base software engineer and business consultant. It checks
the project against the rubric (`Hackathon details.md`), the notes from the Base engineers
(`Gameplan.md`), the playbook's strategy sections, the demo script and the code.

Summary: we're strong on engineering and weak where it touches Base's business. Several claims in
the video script point at things that don't exist.

## Against the rubric, scored as a Base judge would

| Criterion | Est. | Why |
|---|---|---|
| Completeness (15) | 12 | Works end to end locally, with a clean-clone `make demo`, CI green and 373 tests. But the deployed site only serves the three saved demo reports, and with Supabase configured every page except `/` needs a sign-in. |
| Technical depth (15) | 14 | Real pipeline: events from 15-minute readings, a duration band, the Weibull model, empirical Bayes with a backtest, a guarded narrator. Nobody will call this a wrapper. |
| The problem (15) | 12 | Track 3 is a clear fit. Track 1 is thin: most of our insights come from EAGLE-I and EIA, not ERCOT. |
| The "why" (15) | 10 | Undercut by our own numbers (see #2 below). |
| Insight quality (10) | 8 | "Official reliability drops 66-92% of outage minutes" and "the tail is the product" are genuinely non-obvious. |
| Usability (10) | 5 | No widget, no hosted API, a sign-in wall. "Could Base use this tomorrow?" gets a no. |
| Creativity (10) | 7 | Replaying real storms against a real Core is good. Two parallel consumer screens (`/risk` and `/report`) dilute it. |
| Performance (10) | 8 | 82 ms p95, DuckDB, caching, a load test. |
| **Total** | **~76** | |

## Where we missed or contradicted the Base engineers

1. **We never recorded answers to the three questions for Base engineers in the playbook (H-01).**
   Those were: what they tell members about how long a Core lasts, what reserve to assume, and whether
   outage history drives where they launch. The Core spec conflicts in `docs/battery-tech-specs.md` §9
   are also still open: 20 kW or an "11 kW inverter", a 20% reserve or "5 hours at low usage",
   36-72 h or 12-18 h. Our simulator and the "over the power limit" check are built on 20 kW and 20%.
   Base's engineers know the true figures, and a wrong one costs trust instantly. The script's closing
   line has Alejandro saying he "ran the story with Base's engineers", but there's no record of it.

2. **Our numbers say Base's product underdelivers, and we say it on camera.** "One Core lasts about
   9 hours" during Uri, against Base's quoted 36-72 hours. The "right size" for every persona is
   2 Cores, covering only 46-51% of past long-outage hours. To a Base judge, that pitch reads "buy two
   and you're still dark half the time." The fix is framing, not math: Base's 36-72 h assumes you run
   only the essentials. Our household answer already shows that (Thomas, fridge and CPAP only: about
   16 minutes dark a year). Make that the headline, and show the whole-home run time as the caveat.

3. **"Pays twice" rests on disappearing value.** Our own insight #1 shows hours above $1,000/MWh
   falling from about 160 (2021) to 2-8 (2025). ADER value is moving to ancillary services (ECRS,
   Non-Spin), which we don't model. Better to turn it around: "Price spikes are drying up, so
   reliability is Base's lasting value to members." That strengthens Track 3 instead of weakening the
   map.

4. **The word "risk"** (Base: find a synonym for regulatory reasons). `/report` gets this right.
   Christian's screens don't: the `/risk` route, "Goals & risk", "Leads from risk analysis", and the
   `riskScore` shown in the CRM.

5. **Things they hinted at that we didn't address:**
   - New-build neighborhoods as good customers: the housing-growth layer (P2) was never built.
   - Where Base's batteries already are: the fleet overlay is in week two.
   - Other markets: EAGLE-I covers the whole country, so the pipeline could expand beyond Texas. One
     README line would answer this.
   - "Input your bill, see savings and how at risk you are": we deliberately built only the second
     half. Defensible, but the video has to name the compare page as the other half, and the script
     does.

## Claims in the script that aren't true yet

- **"The widget on a mock of Base's compare page" (4:15):** no embeddable widget exists. A mock of
  Base's page would also be imitating their site, so drop that part regardless.
- **"We asked your team":** see #1.
- **README:** the GIF is still a `TODO`.
- **Housekeeping:** `Hackathon details.md` isn't in `.gitignore`. That's one careless `git add .` from
  breaking our own rule against committing it.

## What to do before the 11 PM freeze, most points per hour first

1. Get one Base engineer to answer the Core power and reserve questions tonight, then adjust the
   constants. About 15 min, and it protects every number.
2. Reframe sizing and the replay around essential loads (#2). This is copy and one chart line, about
   1 hour.
3. Make `/report` and `/api/report` reachable without signing in, and add a bare `/embed?zip=` page.
   That makes "usable tomorrow" true. It's about 1 hour, but it touches Christian's auth, so he should
   OK it.
4. Rename the "risk" labels in Christian's screens and reword the scarcity insight (#3 and #4). About
   20 min.
5. Fix the demo script, add `Hackathon details.md` to `.gitignore`, and record the README GIF. About
   20 min.

Items 2 and 3 are the biggest swing: together they'd move about 6-8 points, in "Why" and "Usability".

Open question for the team: did Alejandro get any answers from Base's engineers that never made it
into the playbook?
