-- Migration: 2026-08-10-break-adjustment-time-based.sql
-- Add start_time/end_time columns to support precise time-based adjustment requests.
-- Users can now pick the exact window within their break instead of just "X minutes".

ALTER TABLE break_adjustment_requests
  ADD COLUMN start_time TIME NULL COMMENT 'Adjustment window start time within the break' AFTER requested_minutes,
  ADD COLUMN end_time   TIME NULL COMMENT 'Adjustment window end time within the break' AFTER start_time;
