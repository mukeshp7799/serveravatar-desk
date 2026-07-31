-- Test Case Passed Workflow:
-- 1. Add `passed` column to tb_test_case_assignees (per-assignee passed tracking)
-- 2. Update existing statuses: 'blocked' -> 'in_progress'
-- 3. Change status enum: keep 'passed' (but it becomes computed-only, not manually set)
-- 4. Add computed_status column
-- 5. Auto-compute initial status for TCs with assignees

-- 1. Per-assignee passed flag
ALTER TABLE seravavatar_hub.tb_test_case_assignees
  ADD COLUMN passed TINYINT(1) NOT NULL DEFAULT 0 AFTER user_id;

-- 2. Update any existing blocked statuses before changing enum
UPDATE seravavatar_hub.tb_test_cases SET status = 'in_progress' WHERE status = 'blocked';

-- 3. Update enum to add in_progress (MariaDB lets us extend without recreation)
ALTER TABLE seravavatar_hub.tb_test_cases
  MODIFY COLUMN status ENUM('draft','ready','in_progress','passed','failed','skipped')
  DEFAULT 'draft';

-- 4. Add computed_status column (NULL = manual override active)
ALTER TABLE seravavatar_hub.tb_test_cases
  ADD COLUMN computed_status VARCHAR(20) DEFAULT NULL AFTER status;

-- 5. Compute initial auto-status for all TCs that have assignees
-- Ready = no one has passed yet; In Progress = some passed; Passed = all passed
UPDATE seravavatar_hub.tb_test_cases tc
JOIN (
  SELECT a.test_case_id,
         COUNT(*) AS total,
         SUM(a.passed) AS passed_cnt
  FROM tb_test_case_assignees a
  GROUP BY a.test_case_id
) sub ON sub.test_case_id = tc.id
SET tc.computed_status = CASE
  WHEN sub.passed_cnt = 0 THEN 'ready'
  WHEN sub.passed_cnt < sub.total THEN 'in_progress'
  ELSE 'passed'
END;
