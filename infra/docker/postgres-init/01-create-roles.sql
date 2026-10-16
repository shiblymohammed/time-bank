# PostgreSQL initialization script — runs once on first container start
# Creates the application role with minimal permissions
# NFR-08: Least-privilege service credentials
# NFR-04: Dev-only script — never include in production init

\echo 'Creating KTB application role...'

-- Application runtime user — only what the NestJS API needs
-- NOT a superuser; no create-db or create-role privileges
CREATE ROLE ktb_app WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  PASSWORD 'change_me_app_password';

GRANT CONNECT ON DATABASE ktb_dev TO ktb_app;
GRANT USAGE ON SCHEMA public TO ktb_app;

-- Read-only role for reporting/monitoring (FR-REPORT, NFR-06)
CREATE ROLE ktb_readonly WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  PASSWORD 'change_me_readonly_password';

GRANT CONNECT ON DATABASE ktb_dev TO ktb_readonly;
GRANT USAGE ON SCHEMA public TO ktb_readonly;

\echo 'KTB roles created.'
