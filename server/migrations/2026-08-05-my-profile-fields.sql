-- Migration: 2026-08-05-my-profile-fields.sql
-- Phase 9: My Profile — add personal_email, bio, social_links columns to users

-- Add personal_email column
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN personal_email VARCHAR(255) NULL DEFAULT NULL AFTER phone',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'users'
    AND column_name  = 'personal_email'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add bio column
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN bio TEXT NULL DEFAULT NULL AFTER address',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'users'
    AND column_name  = 'bio'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add social_links column (JSON: { linkedin, twitter, github, website })
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN social_links JSON NULL DEFAULT NULL AFTER bio',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'users'
    AND column_name  = 'social_links'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
