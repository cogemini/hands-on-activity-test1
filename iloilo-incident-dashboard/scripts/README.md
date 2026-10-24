# Spatial preprocessing — Phase 2

`export_spatial.py` reads the existing source with GeoPandas/Pyogrio and validates
source and output geometry with Shapely. `--validate-only` checks the source plus
existing exports without writing anything. It never repairs, re-saves, or writes
to the GeoPackage, calculates replacement points, or exports roads/adjacency.

From the app root, after installing `requirements-spatial.txt` in `.venv`:

```sh
source .venv/bin/activate
python3 scripts/export_spatial.py --source ../data/iloilo_resilience.gpkg --output public/data
python3 scripts/export_spatial.py --source ../data/iloilo_resilience.gpkg --output public/data --validate-only
python3 -m unittest discover -s tests -p 'test_spatial.py' -v
```

The tests default to the existing source path above; set `SPATIAL_SOURCE` to an
alternative source path if needed. Test mutations and repeated exports use
temporary directories, not the original or published outputs.

The three GeoJSON files are sorted by text PSGC, compact JSON, and unsimplified.
Only the generation timestamp normally changes on rerun. To reproduce all four
files byte-for-byte, pass the same `--generated-at "2026-10-24T00:00:00Z"` value
on both runs using the same source and pinned Python environment.

See the main README for interpretation, fields, validation, and limitations.
