-- Migration: Replace passed checkbox with per-assignee execution_status
-- 2026-07-30

-- 1. Add execution_status column (VARCHAR(20), default 'pending')
ALTER TABLE tb_test_case_assignees
  ADD COLUMN execution_status VARCHAR(20) DEFAULT 'pending' AFTER passed;

-- 2. Migrate existing data:
--    passed=1 → execution_status='passed'
--    passed=0 OR NULL → execution_status='pending'
UPDATE tb_test_case_assignees SET execution_status = 'passed' WHERE passed = 1;
UPDATE tb_test_case_assignees SET execution_status = 'pending' WHERE passed = 0 OR passed IS NULL;

-- 3. Drop the old passed column
ALTER TABLE tb_test_case_assignees DROP COLUMN passed;

-- 4. Now recompute auto-status for ALL test cases that are not 'draft'
--    For test cases where computed_status is already set (sticky manual override),
--    we leave them alone. For others, we recalculate.
--    
--    Logic:
--      - If status='draft': keep as-is (draft is manual)
--      - If status IN ('ready','in_progress'): recalculate based on execution_status
--      - If status IN ('passed','failed','skipped'): keep as-is (already resolved)
--
--    First pass: for test cases with status='ready' that have executions started,
--    we want to set them to 'in_progress'. But we can't easily compute this in SQL
--    without a multi-step procedure. For simplicity:
--    - Set computed_status=NULL for all non-draft test cases, forcing recompute on next access
--    - The application logic will handle recompute on next API call

UPDATE tb_test_cases
SET computed_status = NULL
WHERE status != 'draft' AND status != 'skipped';

-- 5. For test cases where ALL assignees are 'passed' (after migration),
--    immediately set them to passed so they don't need a fresh API call to update
--    This is a one-time backfill for consistency
UPDATE tb_test_cases tc
SET
  tc.status = 'passed',
  tc.computed_status = 'passed'
WHERE EXISTS (
  SELECT 1 FROM tb_test_case_assignees a
  WHERE a.test_case_id = tc.id
  GROUP BY a.test_case_id
  HAVING COUNT(*) = SUM(a.execution_status = 'passed')
    AND COUNT(*) > 0
)
AND tc.status NOT IN ('draft', 'skipped', 'passed');

-- 6. For test cases where ANY assignee is 'failed',
--    immediately set them to failed
UPDATE tb_test_cases tc
SET
  tc.status = 'failed',
  tc.computed_status = 'failed'
WHERE EXISTS (
  SELECT 1 FROM tb_test_case_assignees a
  WHERE a.test_case_id = tc.id
    AND a.execution_status = 'failed'
)
AND tc.status NOT IN ('draft', 'skipped', 'passed', 'failed');

-- 7. Add index for faster execution_status queries
CREATE INDEX IF NOT EXISTS idx_tb_test_case_assignees_execution_status
  ON tb_test_case_assignees(execution_status);
