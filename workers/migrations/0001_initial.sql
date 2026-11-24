CREATE TABLE forms (
  id TEXT PRIMARY KEY,
  draft TEXT NOT NULL,
  published TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  schema_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE teams (
  form_id TEXT NOT NULL REFERENCES forms(id),
  team_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  opened_at TEXT NOT NULL,
  PRIMARY KEY (form_id, team_id),
  UNIQUE (form_id, number)
);

CREATE TABLE part_opens (
  form_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  part_id TEXT NOT NULL,
  PRIMARY KEY (form_id, team_id, part_id),
  FOREIGN KEY (form_id, team_id) REFERENCES teams(form_id, team_id)
);

CREATE TABLE answers (
  form_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  part_id TEXT NOT NULL,
  response_id TEXT NOT NULL UNIQUE,
  answers_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  PRIMARY KEY (form_id, team_id, part_id),
  FOREIGN KEY (form_id, team_id) REFERENCES teams(form_id, team_id)
);

CREATE TABLE sheet_exports (
  form_id TEXT PRIMARY KEY REFERENCES forms(id),
  spreadsheet_id TEXT,
  requested_version INTEGER NOT NULL DEFAULT 1,
  completed_version INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  retry_after INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  exported_rows INTEGER NOT NULL DEFAULT 0,
  exported_columns INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE demo_answers (
  response_id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);
