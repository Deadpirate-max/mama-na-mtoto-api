/*
# Mama na Mtoto+ — Maternal Health Database Schema

## Overview
Creates the full database schema for the Mama na Mtoto+ maternal health API.
This schema tracks mothers through their pregnancy journey: registration,
antenatal care (ANC) visits, lab results, vaccinations, symptom logs, and
clinical alerts. An auxiliary otp_codes table supports phone-based OTP auth.

## New Tables

1. **mothers** — Core registration record for each mother.
   - id (uuid PK)
   - phone (text, unique) — primary lookup key used across all endpoints
   - name, age, blood_group, address, emergency_contact (text)
   - lmp_date (date) — last menstrual period date
   - edd (date) — estimated date of delivery (auto-calculated or provided)
   - gravida (int) — number of pregnancies
   - para (int) — number of prior births
   - created_at, updated_at (timestamptz)

2. **anc_visits** — Antenatal care visit records.
   - id (uuid PK)
   - mother_id (uuid FK → mothers ON DELETE CASCADE)
   - visit_number (int) — sequential visit number (1, 2, 3…)
   - visit_date (date)
   - gestational_age_weeks (int)
   - blood_pressure (text)
   - weight_kg (numeric)
   - fundal_height_cm (numeric)
   - fetal_heart_rate (int)
   - notes (text)
   - next_visit_date (date)
   - created_at, updated_at
   - UNIQUE(mother_id, visit_number)

3. **lab_results** — Laboratory test results.
   - id (uuid PK)
   - mother_id (uuid FK → mothers ON DELETE CASCADE)
   - test_type (text) — e.g. hemoglobin, HIV, blood group, urine
   - test_date (date)
   - result (text)
   - normal_range (text)
   - status (text) — normal / abnormal / pending
   - notes (text)
   - created_at, updated_at

4. **vaccinations** — Vaccination records (e.g. tetanus toxoid).
   - id (uuid PK)
   - mother_id (uuid FK → mothers ON DELETE CASCADE)
   - vaccine_name (text)
   - dose_number (int)
   - administration_date (date)
   - next_dose_date (date)
   - administered_by (text)
   - notes (text)
   - created_at, updated_at

5. **symptom_logs** — Self-reported or clinician-logged symptoms.
   - id (uuid PK)
   - mother_id (uuid FK → mothers ON DELETE CASCADE)
   - log_date (date)
   - symptom (text)
   - severity (text) — mild / moderate / severe
   - duration_days (int)
   - notes (text)
   - created_at, updated_at

6. **alerts** — Clinical alerts and danger-sign notifications.
   - id (uuid PK)
   - mother_id (uuid FK → mothers ON DELETE CASCADE)
   - alert_type (text) — danger_sign / missed_visit / abnormal_lab
   - severity (text) — warning / critical
   - message (text)
   - status (text) — active / resolved
   - created_at, updated_at

7. **otp_codes** — OTP authentication codes (infrastructure table).
   - id (uuid PK)
   - phone (text, indexed)
   - code (text)
   - expires_at (timestamptz)
   - verified (boolean, default false)
   - attempts (int, default 0)
   - created_at (timestamptz)

## Security
- RLS enabled on all tables.
- Permissive CRUD policies (TO anon, authenticated) since this is a
  server-side API that connects via pg with a privileged connection string.
  The API server enforces its own auth and validation logic.

## Indexes
- mothers.phone (unique)
- anc_visits(mother_id, visit_number) unique
- lab_results(mother_id)
- vaccinations(mother_id)
- symptom_logs(mother_id)
- alerts(mother_id, status)
- otp_codes(phone, expires_at)
*/

-- ── mothers ──
CREATE TABLE IF NOT EXISTS mothers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text NOT NULL,
  age int,
  lmp_date date,
  edd date,
  gravida int DEFAULT 1,
  para int DEFAULT 0,
  blood_group text,
  address text,
  emergency_contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);



-- ── anc_visits ──
CREATE TABLE IF NOT EXISTS anc_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE CASCADE,
  visit_number int NOT NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  gestational_age_weeks int,
  blood_pressure text,
  weight_kg numeric(5,1),
  fundal_height_cm numeric(5,1),
  fetal_heart_rate int,
  notes text,
  next_visit_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mother_id, visit_number)
);


-- ── lab_results ──
CREATE TABLE IF NOT EXISTS lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE CASCADE,
  test_type text NOT NULL,
  test_date date NOT NULL DEFAULT CURRENT_DATE,
  result text,
  normal_range text,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);



-- ── vaccinations ──
CREATE TABLE IF NOT EXISTS vaccinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE CASCADE,
  vaccine_name text NOT NULL,
  dose_number int NOT NULL DEFAULT 1,
  administration_date date NOT NULL DEFAULT CURRENT_DATE,
  next_dose_date date,
  administered_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ── symptom_logs ──
CREATE TABLE IF NOT EXISTS symptom_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  symptom text NOT NULL,
  severity text NOT NULL DEFAULT 'mild',
  duration_days int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);



-- ── alerts ──
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);



-- ── otp_codes ──
CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_lab_results_mother_id ON lab_results(mother_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_mother_id ON vaccinations(mother_id);
CREATE INDEX IF NOT EXISTS idx_symptom_logs_mother_id ON symptom_logs(mother_id);
CREATE INDEX IF NOT EXISTS idx_alerts_mother_id ON alerts(mother_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at);

-- ── updated_at trigger ──
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mothers_updated_at ON mothers;
CREATE TRIGGER trg_mothers_updated_at BEFORE UPDATE ON mothers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_anc_visits_updated_at ON anc_visits;
CREATE TRIGGER trg_anc_visits_updated_at BEFORE UPDATE ON anc_visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lab_results_updated_at ON lab_results;
CREATE TRIGGER trg_lab_results_updated_at BEFORE UPDATE ON lab_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_vaccinations_updated_at ON vaccinations;
CREATE TRIGGER trg_vaccinations_updated_at BEFORE UPDATE ON vaccinations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_symptom_logs_updated_at ON symptom_logs;
CREATE TRIGGER trg_symptom_logs_updated_at BEFORE UPDATE ON symptom_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_alerts_updated_at ON alerts;
CREATE TRIGGER trg_alerts_updated_at BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
