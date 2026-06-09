-- ============================================================
-- ClinIQ Pro — Tenant Data Fix
-- Run this script on the production database after reviewing
-- the results. DO NOT auto-assign; choose the correct doctorId
-- for each orphaned record.
-- ============================================================

-- ─── 1. Diagnose orphaned patients (doctorId IS NULL) ────────────────────────
SELECT
  id,
  name,
  email,
  phone,
  cpf,
  "createdAt"
FROM "Patient"
WHERE "doctorId" IS NULL
ORDER BY "createdAt" ASC;

-- ─── 2. Template: assign orphaned patients to a specific doctor ──────────────
-- Replace '<DOCTOR_UUID>' with the actual User.id of the target doctor.
-- Run the SELECT above first to identify the records.
--
-- UPDATE "Patient"
-- SET "doctorId" = '<DOCTOR_UUID>'
-- WHERE "doctorId" IS NULL;
--
-- Or to assign a single patient by ID:
-- UPDATE "Patient"
-- SET "doctorId" = '<DOCTOR_UUID>'
-- WHERE id = '<PATIENT_UUID>' AND "doctorId" IS NULL;


-- ─── 3. Diagnose orphaned health plans (doctorId IS NULL) ────────────────────
SELECT
  id,
  name,
  type,
  "defaultValue",
  "createdAt"
FROM "HealthPlan"
WHERE "doctorId" IS NULL
ORDER BY "createdAt" ASC;

-- ─── 4. Template: assign orphaned health plans to a specific doctor ──────────
-- Replace '<DOCTOR_UUID>' with the actual User.id of the target doctor.
--
-- UPDATE "HealthPlan"
-- SET "doctorId" = '<DOCTOR_UUID>'
-- WHERE "doctorId" IS NULL;
--
-- Or to assign a single plan by ID:
-- UPDATE "HealthPlan"
-- SET "doctorId" = '<DOCTOR_UUID>'
-- WHERE id = '<PLAN_UUID>' AND "doctorId" IS NULL;


-- ─── 5. Diagnose orphaned appointment types (doctorId IS NULL) ───────────────
-- These existed before the multi-tenant migration and are currently visible
-- to everyone. Assign them to the appropriate doctor or delete them.
SELECT
  id,
  name,
  "baseValue",
  active,
  "createdAt"
FROM "AppointmentType"
WHERE "doctorId" IS NULL
ORDER BY "createdAt" ASC;

-- Template: assign orphaned appointment types
-- UPDATE "AppointmentType"
-- SET "doctorId" = '<DOCTOR_UUID>'
-- WHERE "doctorId" IS NULL;


-- ─── 6. Find stale RoomSecretary records (cross-tenant contamination) ────────
SELECT rs.id, rs."roomId", rs."secretaryId",
       u.name as secretary_name, r."doctorId",
       dr.name as doctor_name
FROM "RoomSecretary" rs
JOIN "Room" r ON r.id = rs."roomId"
JOIN "User" u ON u.id = rs."secretaryId"
JOIN "User" dr ON dr.id = r."doctorId"
WHERE NOT EXISTS (
  SELECT 1 FROM "DoctorSecretary" ds
  WHERE ds."doctorId" = r."doctorId"
    AND ds."secretaryId" = rs."secretaryId"
    AND ds.active = true
);

-- Fix: Delete those stale links
DELETE FROM "RoomSecretary"
WHERE id IN (
  SELECT rs.id FROM "RoomSecretary" rs
  JOIN "Room" r ON r.id = rs."roomId"
  WHERE NOT EXISTS (
    SELECT 1 FROM "DoctorSecretary" ds
    WHERE ds."doctorId" = r."doctorId"
      AND ds."secretaryId" = rs."secretaryId"
      AND ds.active = true
  )
);


-- ─── 7. Summary counts ───────────────────────────────────────────────────────
SELECT
  'Patient'         AS "model",
  COUNT(*)          AS orphaned_count
FROM "Patient"
WHERE "doctorId" IS NULL
UNION ALL
SELECT
  'HealthPlan'      AS "model",
  COUNT(*)          AS orphaned_count
FROM "HealthPlan"
WHERE "doctorId" IS NULL
UNION ALL
SELECT
  'AppointmentType' AS "model",
  COUNT(*)          AS orphaned_count
FROM "AppointmentType"
WHERE "doctorId" IS NULL;
