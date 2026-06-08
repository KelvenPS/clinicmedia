# Prisma Migrations

This directory contains database migration files managed by Prisma Migrate.

## Generating Migrations (Development)

When you change `schema.prisma`, create a new migration:

```bash
npx prisma migrate dev --name describe_your_change
```

This will:
1. Generate a new SQL migration file in this directory
2. Apply it to your development database
3. Regenerate the Prisma Client

## Applying Migrations (Production / Docker)

The `Dockerfile.backend` CMD automatically runs:

```bash
npx prisma migrate deploy
```

This applies all pending migrations in order without prompting.

## First-time Setup (no migrations yet)

If this directory has no migration files, you need to create the initial migration
from your existing schema **before deploying**:

```bash
# From the backend package directory:
npx prisma migrate dev --name init
```

Then commit the generated migration files and push to your VPS.

## Current Schema

The schema at `packages/backend/prisma/schema.prisma` defines:
- User (roles: ADMIN, DOCTOR, SECRETARY)
- Patient, HealthPlan, PatientPlan
- Appointment, AppointmentType, AppointmentBlock
- Transaction (financial records)
- MedicalRecord, Assessment
- Room, RoomSecretary, DoctorSecretary
- DocumentTemplate, Notification
- PaymentMethod, DoctorSubscription
- Integration, WebhookLog
