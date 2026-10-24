-- Destructive LOCAL reset; invoke only through the confirmation-gated script.
DROP TABLE IF EXISTS incident_status_history;
DROP TABLE IF EXISTS incidents;
DROP TABLE IF EXISTS incident_categories;
DROP TABLE IF EXISTS barangays;
DROP TABLE IF EXISTS d1_migrations;
