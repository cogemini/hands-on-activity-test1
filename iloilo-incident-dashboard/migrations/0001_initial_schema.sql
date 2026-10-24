PRAGMA foreign_keys = ON;

CREATE TABLE barangays (
  psgc TEXT PRIMARY KEY NOT NULL CHECK(length(trim(psgc)) > 0),
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  representative_longitude REAL NOT NULL CHECK(representative_longitude BETWEEN -180 AND 180),
  representative_latitude REAL NOT NULL CHECK(representative_latitude BETWEEN -90 AND 90),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
);
CREATE TABLE incident_categories (
  code TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
);
CREATE TABLE incidents (
  id TEXT PRIMARY KEY NOT NULL,
  public_reference TEXT NOT NULL UNIQUE,
  barangay_psgc TEXT NOT NULL REFERENCES barangays(psgc),
  category_code TEXT NOT NULL REFERENCES incident_categories(code),
  severity TEXT NOT NULL CHECK(severity IN ('low','moderate','high','critical')),
  occurred_at TEXT NOT NULL,
  description_private TEXT CHECK(description_private IS NULL OR length(description_private) <= 1000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','under_review','verified','responding','resolved','rejected')),
  is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submission_key TEXT UNIQUE,
  submission_fingerprint TEXT,
  CHECK(is_public = 0 OR status IN ('verified','responding','resolved'))
);
CREATE TABLE incident_status_history (
  id TEXT PRIMARY KEY NOT NULL,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  from_status TEXT CHECK(from_status IS NULL OR from_status IN ('submitted','under_review','verified','responding','resolved','rejected')),
  to_status TEXT NOT NULL CHECK(to_status IN ('submitted','under_review','verified','responding','resolved','rejected')),
  changed_at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('system','local_demo_reviewer')),
  note_private TEXT CHECK(note_private IS NULL OR length(note_private) <= 1000)
);
CREATE INDEX idx_incident_barangay ON incidents(barangay_psgc);
CREATE INDEX idx_incident_category ON incidents(category_code);
CREATE INDEX idx_incident_severity ON incidents(severity);
CREATE INDEX idx_incident_status ON incidents(status);
CREATE INDEX idx_incident_occurred ON incidents(occurred_at);
CREATE INDEX idx_incident_created ON incidents(created_at DESC);
CREATE INDEX idx_incident_public_filters ON incidents(is_public,status,category_code,severity,occurred_at);
CREATE INDEX idx_history_incident_time ON incident_status_history(incident_id,changed_at);

CREATE TRIGGER enforce_active_incident_references BEFORE INSERT ON incidents
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM barangays WHERE psgc=NEW.barangay_psgc AND is_active=1)
    THEN RAISE(ABORT,'inactive barangay') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM incident_categories WHERE code=NEW.category_code AND is_active=1)
    THEN RAISE(ABORT,'inactive category') END;
END;
CREATE TRIGGER enforce_initial_incident_state BEFORE INSERT ON incidents
WHEN NEW.status != 'submitted' OR NEW.is_public != 0
BEGIN SELECT RAISE(ABORT,'invalid initial state'); END;
CREATE TRIGGER enforce_status_transition BEFORE UPDATE OF status ON incidents
WHEN NEW.status != OLD.status AND NOT (
  (OLD.status='submitted' AND NEW.status IN ('under_review','rejected')) OR
  (OLD.status='under_review' AND NEW.status IN ('verified','rejected')) OR
  (OLD.status='verified' AND NEW.status IN ('responding','resolved')) OR
  (OLD.status='responding' AND NEW.status='resolved')
)
BEGIN SELECT RAISE(ABORT,'invalid status transition'); END;
