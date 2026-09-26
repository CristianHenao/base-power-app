"""The browser appliance calculator must use the simulator's Core constants and agree with it."""
import re

import numpy as np
import pytest

from api.app.sim.backup import KW_PER_CORE, KWH_PER_CORE, RESERVE_SOC, hours_until_empty
from pipeline import settings

TS = settings.REPO_ROOT / "src" / "lib" / "report" / "core-runtime.ts"


def ts_constant(name: str) -> float:
    match = re.search(rf"export const {name} = ([0-9.]+);", TS.read_text())
    assert match, f"{name} is missing from {TS.name}"
    return float(match.group(1))


@pytest.mark.parametrize("name, value", [("KWH_PER_CORE", KWH_PER_CORE), ("KW_PER_CORE", KW_PER_CORE),
                                         ("RESERVE_SOC", RESERVE_SOC)])
def test_constants_match_the_simulator(name, value):
    assert ts_constant(name) == pytest.approx(value)


def test_steady_load_formula_matches_the_simulator():
    # The TS calculator uses kWh / kW; the simulator walks 15-minute steps. They agree for a steady load.
    load_kw = 1.7
    hours, _ = hours_until_empty(np.full(400, load_kw), cores=1, start_soc=RESERVE_SOC)
    assert hours == pytest.approx(KWH_PER_CORE * RESERVE_SOC / load_kw)
