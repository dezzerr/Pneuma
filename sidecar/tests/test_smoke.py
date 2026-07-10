"""Smoke test to verify pytest infrastructure works."""

import pneuma_sidecar.scripture_parser as scripture_parser


def test_module_importable():
    """Verify the scripture_parser module can be imported."""
    assert hasattr(scripture_parser, "parse")
