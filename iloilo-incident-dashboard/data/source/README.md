# Read-only spatial source

The existing source is at `../../../data/iloilo_resilience.gpkg` relative to this
directory (or `../data/iloilo_resilience.gpkg` from the application root).
Leave it in place. `scripts/export_spatial.py` accepts an explicit `--source`
argument and hashes the original before and after every run.

Alternatively, a new installation may place its source at
`data/source/iloilo_resilience.gpkg` within the application. Do not overwrite or
edit the source, fabricate missing geographic data, or commit it inadvertently.
