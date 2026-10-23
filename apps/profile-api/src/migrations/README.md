# Database Migrations

This directory contains database migration files for the profile-api service.

## Performance Optimizations

### Migration 001: Add Performance Indexes

**File:** `001_add_performance_indexes.sql`  
**Rollback:** `001_add_performance_indexes_rollback.sql`

#### Overview

This migration adds composite indexes to optimize the `find-profile-with-enhanced-consent` query performance on large tables.

#### Indexes Added

1. **`idx_profile_details_profile_org_latest`**
   - **Table:** `profile_details`
   - **Columns:** `(profile_id, organisation_id, is_latest)`
   - **Purpose:** Optimizes profile details lookup by profile_id, organisation_id, and is_latest flag

2. **`idx_profile_details_profile_null_org_latest`**
   - **Table:** `profile_details`
   - **Columns:** `(profile_id)` with partial condition `WHERE organisation_id IS NULL AND is_latest = true`
   - **Purpose:** Optimizes profile details lookup when organisation_id is NULL (common case)

3. **`idx_profile_data_profile_details_id`**
   - **Table:** `profile_data`
   - **Columns:** `(profile_details_id)`
   - **Purpose:** Optimizes profile data aggregation by profile_details_id

4. **`idx_profile_consents_profile_subject_created`**
   - **Table:** `profile_consents`
   - **Columns:** `(profile_id, subject, created_at DESC)`
   - **Purpose:** Optimizes latest consent lookup by profile_id, subject, and created_at ordering

5. **`idx_consent_statements_subject_publish_version_enabled`**
   - **Table:** `consent_statements`
   - **Columns:** `(subject, publish_date DESC, version DESC)` with partial condition `WHERE is_enabled = true`
   - **Purpose:** Optimizes latest enabled consent statement lookup by subject, publish_date, and version

#### Performance Impact

These indexes address the following performance bottlenecks in the `find-profile-with-enhanced-consent` query:
- **Profile Details Subquery:** Eliminates table scans when filtering profile_details by profile_id, organisation_id, and is_latest
- **Profile Data Aggregation:** Speeds up JOINs between profile_data and profile_details
- **Consent Lookup:** Provides efficient access to latest consents per subject for a profile
- **Statement Lookup:** Optimizes finding the most recent enabled consent statement per subject

#### Usage Notes

- All indexes use `CREATE INDEX CONCURRENTLY` to avoid blocking table access during creation
- Partial indexes are used where appropriate to reduce index size and improve selectivity
- The `IF NOT EXISTS` clause ensures the migration is idempotent
- Indexes are created with descriptive names and comments for maintainability

#### Rollback

To rollback this migration, run the `001_add_performance_indexes_rollback.sql` file. This will remove all added indexes using `DROP INDEX CONCURRENTLY` to minimize downtime.

#### Monitoring

After applying these indexes, monitor:
- Query execution time for `find-profile-with-enhanced-consent`
- Index usage statistics
- Overall database performance impact
- Storage space usage (indexes consume additional space)
