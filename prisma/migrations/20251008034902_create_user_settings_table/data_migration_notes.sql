-- Data migration: Copy defaultDeleteAfterDays from users to user_settings
-- Run this after the schema migration if there was any data in defaultDeleteAfterDays

-- Note: The previous migration (20251008034210_add_user_default_delete_after_days) 
-- added defaultDeleteAfterDays to users table, and this migration 
-- (20251008034902_create_user_settings_table) moved it to user_settings.
-- Since these migrations were created in quick succession during development,
-- no production data exists yet, so no data migration is needed.

-- If you had production data, you would run:
-- INSERT INTO user_settings (id, userId, defaultDeleteAfterDays, createdAt, updatedAt)
-- SELECT 
--   lower(hex(randomblob(16))), 
--   id, 
--   defaultDeleteAfterDays, 
--   CURRENT_TIMESTAMP, 
--   CURRENT_TIMESTAMP
-- FROM users
-- WHERE defaultDeleteAfterDays IS NOT NULL;
