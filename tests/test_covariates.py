import numpy as np
import pandas as pd
import pytest

from pipeline.covariates import coop_share
from pipeline.outlook import covariate_shrink, poisson_glm


def test_poisson_glm_recovers_a_rate_ratio():
    rng = np.random.default_rng(3)
    x = np.column_stack([np.ones(400), np.repeat([0.0, 1.0], 200)])
    exposure = np.full(400, 8.0)
    counts = rng.poisson(exposure * np.exp(-2.0 + 0.7 * x[:, 1]))
    beta = poisson_glm(x, counts.astype(float), exposure, ridge=0.0)
    assert beta == pytest.approx([-2.0, 0.7], abs=0.12)


def test_covariate_shrink_pulls_a_thin_county_to_its_prior():
    post, lo, hi = covariate_shrink(np.array([0.0, 4.0]), np.array([0.5, 8.0]), np.array([0.3, 0.3]))
    assert post[0] == pytest.approx(0.3, rel=0.2)
    assert lo[1] < post[1] < hi[1]


def test_coop_share_weights_by_customer_share():
    utilities = pd.DataFrame({"county_fips": ["1", "1", "2"], "share": [0.25, 0.75, 1.0],
                              "utility_name": ["Bluebonnet Electric Coop", "Oncor", "Pedernales Electric Cooperative"]})
    assert coop_share(utilities).to_dict() == {"1": 0.25, "2": 1.0}
