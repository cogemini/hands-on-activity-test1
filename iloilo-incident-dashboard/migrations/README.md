# Local D1 migrations

- `0001_initial_schema.sql`: four tables, FKs, CHECK constraints, indexes, active
  reference and workflow triggers; no incident coordinates or reporter identities.
- `0002_reference_data.sql`: 180 barangays derived from validated representative
  points and the nine approved categories. No incident records.

From the app root: `npm run db:migrate:local`. Every database command is explicitly
`--local`. No Cloudflare account or real database ID is needed.

To reproduce the reference migration after activating `.venv`:

```sh
python3 scripts/generate_reference_seed.py
```

Do not edit an applied migration to evolve a populated schema; add a new numbered
migration instead. The reset command is separately documented and destructive to
normal local incident data, with mandatory interactive confirmation.
