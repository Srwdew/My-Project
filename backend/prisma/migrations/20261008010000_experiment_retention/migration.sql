-- Retention control only. Main Anomaly history and its triggers are untouched.
CREATE SCHEMA experiment_retention;
CREATE TABLE experiment_retention.subject (
 user_id text PRIMARY KEY REFERENCES public."User"(id) ON DELETE RESTRICT,
 withdrawn_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 database_purged_at timestamptz,
 inventory_verified boolean NOT NULL DEFAULT false
);
CREATE TABLE experiment_retention.artifact (
 id text PRIMARY KEY,
 path text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('backup','export')),
 created_at timestamptz NOT NULL,
 expires_at timestamp GENERATED ALWAYS AS (created_at AT TIME ZONE 'UTC' + interval '30 days') STORED,
 state text NOT NULL DEFAULT 'present' CHECK(state IN ('present','deleted','failed')),
 deleted_at timestamptz,
 error_code text,
 CHECK((state='deleted')=(deleted_at IS NOT NULL))
);
-- expires_at is timestamp without time zone in UTC; service uses created_at + exact 30 days.
CREATE TABLE experiment_retention.artifact_subject (
 artifact_id text NOT NULL REFERENCES experiment_retention.artifact(id) ON DELETE RESTRICT,
 user_id text NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 PRIMARY KEY(artifact_id,user_id)
);
CREATE TABLE experiment_retention.control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 restore_verified boolean NOT NULL DEFAULT false
);
INSERT INTO experiment_retention.control DEFAULT VALUES;
-- Only minimal withdrawal metadata; no money, labels, transaction snapshots.
