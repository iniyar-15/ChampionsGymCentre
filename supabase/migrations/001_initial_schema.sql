-- Champions Gymnastics Centre - Initial Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── APPARATUS ────────────────────────────────────────────────────────────────
CREATE TABLE apparatus (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  gender      TEXT CHECK (gender IN ('male', 'female', 'mixed')) DEFAULT 'mixed',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SKILLS ───────────────────────────────────────────────────────────────────
CREATE TABLE skills (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  apparatus_id UUID REFERENCES apparatus(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LEVELS ───────────────────────────────────────────────────────────────────
CREATE TABLE levels (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  start_age   INTEGER,
  end_age     INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Level ↔ Apparatus (many-to-many)
CREATE TABLE level_apparatus (
  level_id     UUID REFERENCES levels(id) ON DELETE CASCADE,
  apparatus_id UUID REFERENCES apparatus(id) ON DELETE CASCADE,
  PRIMARY KEY (level_id, apparatus_id)
);

-- Level ↔ Skills (many-to-many)
CREATE TABLE level_skills (
  level_id UUID REFERENCES levels(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (level_id, skill_id)
);

-- ─── BATCHES ──────────────────────────────────────────────────────────────────
CREATE TABLE batches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  days        TEXT[] NOT NULL DEFAULT '{}',
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FEE STRUCTURES ───────────────────────────────────────────────────────────
CREATE TABLE fee_structures (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  days_per_week INTEGER NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USERS (staff: admin, manager, coach) ────────────────────────────────────
-- Links to Supabase auth.users
CREATE TABLE users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'coach')),
  phone         TEXT,
  email         TEXT,
  date_of_birth DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Coach ↔ Batch assignments
CREATE TABLE coach_batches (
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_id, batch_id)
);

-- Coach ↔ Level assignments
CREATE TABLE coach_levels (
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  level_id UUID REFERENCES levels(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_id, level_id)
);

-- ─── STUDENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE students (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  parent_name       TEXT,
  contact_phone     TEXT NOT NULL,
  secondary_phone   TEXT,
  date_of_birth     DATE NOT NULL,
  gender            TEXT CHECK (gender IN ('male', 'female', 'other')),
  school            TEXT,
  level_id          UUID REFERENCES levels(id),
  fee_structure_id  UUID REFERENCES fee_structures(id),
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Computed age helper (available as a function)
CREATE OR REPLACE FUNCTION calculate_age(dob DATE)
RETURNS INTEGER AS $$
  SELECT DATE_PART('year', AGE(NOW(), dob))::INTEGER;
$$ LANGUAGE SQL STABLE;

-- Student ↔ Batch enrollment
CREATE TABLE student_batches (
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  batch_id   UUID REFERENCES batches(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, batch_id)
);

-- ─── COMPETITIONS ─────────────────────────────────────────────────────────────
CREATE TABLE competitions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  organized_by TEXT,
  location     TEXT,
  start_date   DATE,
  end_date     DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE competition_age_groups (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  min_age        INTEGER,
  max_age        INTEGER
);

CREATE TABLE competition_age_group_apparatus (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  age_group_id UUID REFERENCES competition_age_groups(id) ON DELETE CASCADE,
  apparatus_id UUID REFERENCES apparatus(id) ON DELETE CASCADE,
  UNIQUE (age_group_id, apparatus_id)
);

CREATE TABLE competition_apparatus_skills (
  age_group_apparatus_id UUID REFERENCES competition_age_group_apparatus(id) ON DELETE CASCADE,
  skill_id               UUID REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (age_group_apparatus_id, skill_id)
);

CREATE TABLE competition_enrollments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month            DATE NOT NULL,
  student_id       UUID REFERENCES students(id) ON DELETE CASCADE,
  fee_structure_id UUID REFERENCES fee_structures(id),
  amount           DECIMAL(10,2) NOT NULL,
  paid_amount      DECIMAL(10,2) DEFAULT 0,
  paid_date        DATE,
  payment_mode     TEXT CHECK (payment_mode IN ('cash', 'online', 'cheque', 'upi', 'bank_transfer')),
  reference_id     TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (month, student_id)
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE apparatus ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_age_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_age_group_apparatus ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_apparatus_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_apparatus ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_batches ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper to check if current user is staff (admin/manager/coach)
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid());
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper to get student id for current auth user
CREATE OR REPLACE FUNCTION get_student_id()
RETURNS UUID AS $$
  SELECT id FROM students WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Staff can read everything
CREATE POLICY "staff_read_all" ON users FOR SELECT USING (is_staff());
CREATE POLICY "admin_manage_users" ON users FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "staff_read_students" ON students FOR SELECT USING (is_staff());
CREATE POLICY "student_read_own" ON students FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY "admin_manage_students" ON students FOR ALL USING (get_user_role() = 'admin');

-- Open read policies for reference data (batches, levels, apparatus, skills, fee_structures)
CREATE POLICY "authenticated_read_batches" ON batches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_batches" ON batches FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_levels" ON levels FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_levels" ON levels FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_apparatus" ON apparatus FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_apparatus" ON apparatus FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_skills" ON skills FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_skills" ON skills FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_fee_structures" ON fee_structures FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_fee_structures" ON fee_structures FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_level_apparatus" ON level_apparatus FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_level_apparatus" ON level_apparatus FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_level_skills" ON level_skills FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_level_skills" ON level_skills FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "staff_read_coach_batches" ON coach_batches FOR SELECT USING (is_staff());
CREATE POLICY "admin_manage_coach_batches" ON coach_batches FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "staff_read_coach_levels" ON coach_levels FOR SELECT USING (is_staff());
CREATE POLICY "admin_manage_coach_levels" ON coach_levels FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_student_batches" ON student_batches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_student_batches" ON student_batches FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_competitions" ON competitions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_competitions" ON competitions FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_age_groups" ON competition_age_groups FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_age_groups" ON competition_age_groups FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_comp_apparatus" ON competition_age_group_apparatus FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_comp_apparatus" ON competition_age_group_apparatus FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "authenticated_read_comp_skills" ON competition_apparatus_skills FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_comp_skills" ON competition_apparatus_skills FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "staff_read_enrollments" ON competition_enrollments FOR SELECT USING (is_staff());
CREATE POLICY "student_read_own_enrollments" ON competition_enrollments FOR SELECT USING (student_id = get_student_id());
CREATE POLICY "student_enroll" ON competition_enrollments FOR INSERT WITH CHECK (student_id = get_student_id());
CREATE POLICY "admin_manage_enrollments" ON competition_enrollments FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "staff_read_attendance" ON attendance FOR SELECT USING (is_staff());
CREATE POLICY "student_read_own_attendance" ON attendance FOR SELECT USING (student_id = get_student_id());
CREATE POLICY "coach_manage_attendance" ON attendance FOR ALL USING (get_user_role() IN ('admin', 'coach'));

CREATE POLICY "authenticated_read_curriculum" ON curriculum FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "coach_manage_curriculum" ON curriculum FOR ALL USING (get_user_role() IN ('admin', 'coach'));

CREATE POLICY "authenticated_read_curriculum_skills" ON curriculum_skills FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "coach_manage_curriculum_skills" ON curriculum_skills FOR ALL USING (get_user_role() IN ('admin', 'coach'));

CREATE POLICY "staff_read_feedback" ON feedback FOR SELECT USING (is_staff());
CREATE POLICY "student_read_own_feedback" ON feedback FOR SELECT USING (student_id = get_student_id());
CREATE POLICY "coach_manage_feedback" ON feedback FOR ALL USING (get_user_role() IN ('admin', 'coach'));

CREATE POLICY "staff_read_fee_collections" ON fee_collections FOR SELECT USING (is_staff());
CREATE POLICY "student_read_own_fees" ON fee_collections FOR SELECT USING (student_id = get_student_id());
CREATE POLICY "student_insert_fees" ON fee_collections FOR INSERT WITH CHECK (student_id = get_student_id());
CREATE POLICY "student_update_own_fees" ON fee_collections FOR UPDATE USING (student_id = get_student_id());
CREATE POLICY "admin_manage_fee_collections" ON fee_collections FOR ALL USING (get_user_role() IN ('admin', 'manager'));

-- ─── TRIGGERS FOR updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_levels_updated_at BEFORE UPDATE ON levels FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_apparatus_updated_at BEFORE UPDATE ON apparatus FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_skills_updated_at BEFORE UPDATE ON skills FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_fee_structures_updated_at BEFORE UPDATE ON fee_structures FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_fee_collections_updated_at BEFORE UPDATE ON fee_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_competitions_updated_at BEFORE UPDATE ON competitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_feedback_updated_at BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION update_updated_at();