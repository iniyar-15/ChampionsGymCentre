-- ─── Competition enhancements ────────────────────────────────────────────────

-- Add time fields to competitions
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS end_time   TIME;

-- Add level filter and entry fee to age groups
ALTER TABLE competition_age_groups ADD COLUMN IF NOT EXISTS level_id   UUID REFERENCES levels(id) ON DELETE SET NULL;
ALTER TABLE competition_age_groups ADD COLUMN IF NOT EXISTS entry_fee  DECIMAL(10,2);
ALTER TABLE competition_age_groups ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Shortlist table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competition_shortlist (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  age_group_id UUID NOT NULL REFERENCES competition_age_groups(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'shortlisted'
                 CHECK (status IN ('shortlisted', 'finalized', 'removed')),
  notified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (age_group_id, student_id)
);

CREATE TRIGGER trg_competition_shortlist_updated_at
  BEFORE UPDATE ON competition_shortlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE competition_shortlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_shortlist"   ON competition_shortlist FOR SELECT USING (is_staff());
CREATE POLICY "admin_manage_shortlist" ON competition_shortlist FOR ALL    USING (get_user_role() = 'admin');

-- ─── Announcements table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          TEXT NOT NULL,
  body           TEXT,
  competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_announcements" ON announcements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_announcements"        ON announcements FOR ALL    USING (get_user_role() = 'admin');

-- ─── Announcement reads table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES students(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (announcement_id, student_id)
);

ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_ann_reads"   ON announcement_reads FOR SELECT USING (is_staff());
CREATE POLICY "student_manage_reads"   ON announcement_reads FOR ALL
  USING (student_id IN (SELECT id FROM students WHERE auth_id = auth.uid()));

-- ─── Auto-create announcement when competition is added ───────────────────────
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_competition_announce ON competitions;
CREATE TRIGGER trg_competition_announce
  AFTER INSERT ON competitions
  FOR EACH ROW EXECUTE FUNCTION auto_create_competition_announcement();
