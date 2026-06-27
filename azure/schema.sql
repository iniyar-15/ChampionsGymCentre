-- Champions Gymnastics Centre — Azure PostgreSQL Schema
-- Run this in Azure PostgreSQL (no Supabase dependencies)

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── APPARATUS ────────────────────────────────────────────────────────────────
CREATE TABLE apparatus (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  gender     TEXT CHECK (gender IN ('male', 'female', 'mixed')) DEFAULT 'mixed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SKILLS ───────────────────────────────────────────────────────────────────
CREATE TABLE skills (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  apparatus_id UUID REFERENCES apparatus(id) ON DELETE CASCADE,
  category     TEXT,
  description  TEXT,
  value        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LEVELS ───────────────────────────────────────────────────────────────────
CREATE TABLE levels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  start_age  INTEGER,
  end_age    INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE level_apparatus (
  level_id     UUID REFERENCES levels(id) ON DELETE CASCADE,
  apparatus_id UUID REFERENCES apparatus(id) ON DELETE CASCADE,
  PRIMARY KEY (level_id, apparatus_id)
);

CREATE TABLE level_skills (
  level_id UUID REFERENCES levels(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (level_id, skill_id)
);

-- ─── BATCHES ──────────────────────────────────────────────────────────────────
CREATE TABLE batches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  days       TEXT[] NOT NULL DEFAULT '{}',
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  start_date DATE,
  end_date   DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FEE STRUCTURES ───────────────────────────────────────────────────────────
CREATE TABLE fee_structures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  days_per_week INTEGER NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USERS (staff: admin, manager, coach) ────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'coach')),
  phone         TEXT,
  email         TEXT,
  date_of_birth DATE,
  password_hash TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE coach_batches (
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_id, batch_id)
);

CREATE TABLE coach_levels (
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  level_id UUID REFERENCES levels(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_id, level_id)
);

-- ─── STUDENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE students (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  parent_name      TEXT,
  contact_phone    TEXT NOT NULL,
  secondary_phone  TEXT,
  email            TEXT,
  date_of_birth    DATE NOT NULL,
  gender           TEXT CHECK (gender IN ('male', 'female', 'other')),
  school           TEXT,
  level_id         UUID REFERENCES levels(id),
  fee_structure_id UUID REFERENCES fee_structures(id),
  is_active        BOOLEAN DEFAULT TRUE,
  password_hash    TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION calculate_age(dob DATE)
RETURNS INTEGER AS $$
  SELECT DATE_PART('year', AGE(NOW(), dob))::INTEGER;
$$ LANGUAGE SQL STABLE;

CREATE TABLE student_batches (
  student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
  batch_id    UUID REFERENCES batches(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, batch_id)
);

-- ─── COMPETITIONS ─────────────────────────────────────────────────────────────
CREATE TABLE competitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  organized_by TEXT,
  location     TEXT,
  start_date   DATE,
  end_date     DATE,
  start_time   TIME,
  end_time     TIME,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE competition_age_groups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  min_age        INTEGER,
  max_age        INTEGER,
  level_id       UUID REFERENCES levels(id) ON DELETE SET NULL,
  entry_fee      DECIMAL(10,2),
  is_finalized   BOOLEAN NOT NULL DEFAULT FALSE,
  start_date     DATE,
  end_date       DATE,
  start_time     TIME,
  end_time       TIME
);

CREATE TABLE competition_age_group_apparatus (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group_id UUID REFERENCES competition_age_groups(id) ON DELETE CASCADE,
  apparatus_id UUID REFERENCES apparatus(id) ON DELETE CASCADE,
  UNIQUE (age_group_id, apparatus_id)
);

CREATE TABLE competition_apparatus_skills (
  age_group_apparatus_id UUID REFERENCES competition_age_group_apparatus(id) ON DELETE CASCADE,
  skill_id               UUID REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (age_group_apparatus_id, skill_id)
);

CREATE TABLE competition_shortlist (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group_id          UUID NOT NULL REFERENCES competition_age_groups(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'shortlisted'
                          CHECK (status IN ('shortlisted', 'finalized', 'removed', 'confirmed')),
  notified_at           TIMESTAMPTZ,
  entry_fee_paid        BOOLEAN DEFAULT FALSE,
  entry_fee_payment_mode TEXT,
  confirmed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (age_group_id, student_id)
);

CREATE TABLE competition_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group_id UUID REFERENCES competition_age_groups(id) ON DELETE CASCADE,
  student_id   UUID REFERENCES students(id) ON DELETE CASCADE,
  apparatus_id UUID REFERENCES apparatus(id) ON DELETE CASCADE,
  points       DECIMAL(10,2),
  rank         INTEGER,
  awards       TEXT,
  enrolled_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (age_group_id, student_id, apparatus_id)
);

-- ─── ATTENDANCE ───────────────────────────────────────────────────────────────
CREATE TABLE attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID REFERENCES batches(id) ON DELETE CASCADE,
  level_id   UUID REFERENCES levels(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  marked_by  UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (batch_id, student_id, date)
);

-- ─── CURRICULUM ───────────────────────────────────────────────────────────────
CREATE TABLE curriculum (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     UUID REFERENCES batches(id) ON DELETE CASCADE,
  level_id     UUID REFERENCES levels(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  apparatus_id UUID REFERENCES apparatus(id) ON DELETE CASCADE,
  coach_id     UUID REFERENCES users(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (batch_id, date, apparatus_id)
);

CREATE TABLE curriculum_skills (
  curriculum_id UUID REFERENCES curriculum(id) ON DELETE CASCADE,
  skill_id      UUID REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (curriculum_id, skill_id)
);

-- ─── FEEDBACK ─────────────────────────────────────────────────────────────────
CREATE TABLE feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID REFERENCES students(id) ON DELETE CASCADE,
  month         DATE NOT NULL,
  apparatus_id  UUID REFERENCES apparatus(id) ON DELETE CASCADE,
  skill_id      UUID REFERENCES skills(id),
  feedback_text TEXT,
  coach_id      UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FEE COLLECTIONS ──────────────────────────────────────────────────────────
CREATE TABLE fee_collections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month            DATE NOT NULL,
  student_id       UUID REFERENCES students(id) ON DELETE CASCADE,
  fee_structure_id UUID REFERENCES fee_structures(id),
  amount           DECIMAL(10,2) NOT NULL,
  paid_amount      DECIMAL(10,2) DEFAULT 0,
  paid_date        DATE,
  payment_mode     TEXT CHECK (payment_mode IN ('cash', 'online', 'cheque', 'upi', 'bank_transfer')),
  reference_id     TEXT,
  notes            TEXT,
  receipt_url      TEXT,
  cash_received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
CREATE TABLE announcements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  body           TEXT,
  competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE announcement_reads (
  announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES students(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (announcement_id, student_id)
);

-- ─── TRIGGERS FOR updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at              BEFORE UPDATE ON users              FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_students_updated_at           BEFORE UPDATE ON students           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_batches_updated_at            BEFORE UPDATE ON batches            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_levels_updated_at             BEFORE UPDATE ON levels             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_apparatus_updated_at          BEFORE UPDATE ON apparatus          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_skills_updated_at             BEFORE UPDATE ON skills             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_fee_structures_updated_at     BEFORE UPDATE ON fee_structures     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_fee_collections_updated_at    BEFORE UPDATE ON fee_collections    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_competitions_updated_at       BEFORE UPDATE ON competitions       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_competition_shortlist_updated BEFORE UPDATE ON competition_shortlist FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_feedback_updated_at           BEFORE UPDATE ON feedback           FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Auto-create announcement on new competition ──────────────────────────────
CREATE OR REPLACE FUNCTION auto_create_competition_announcement()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO announcements (title, body, competition_id)
  VALUES (
    'New Competition: ' || NEW.name,
    'A new competition has been added: ' || NEW.name
      || COALESCE('. Date: ' || to_char(NEW.start_date, 'DD Mon YYYY'), '')
      || COALESCE('. Location: ' || NEW.location, ''),
    NEW.id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_competition_announce
  AFTER INSERT ON competitions
  FOR EACH ROW EXECUTE FUNCTION auto_create_competition_announcement();
