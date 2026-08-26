/**
 * Project Activity recorder.
 *
 * `recordActivity(pool, payload)` is fire-and-forget. It runs a single
 * INSERT into `project_activities` and logs (but does NOT throw) on
 * failure so it never breaks the parent operation. The dashboard's
 * Activity Timeline card and the /projects/:id/activity page both read
 * from this table.
 *
 * Payload:
 *   {
 *     projectId:    number,
 *     actorId:      number,
 *     feature:      string,          // FEATURE_META key
 *     action:       string,          // 'created' | 'updated' | 'deleted' | 'moved' | 'completed' | ...
 *     targetType:   string,          // 'task' | 'message' | 'document' | 'member' | ...
 *     targetId?:    string | number | null,
 *     targetLabel?: string | null,
 *     meta?:        object | null,   // serialised as JSON
 *   }
 *
 * FEATURE_META is the canonical map between internal feature slugs and
 * the display label + Tailwind accent used in the timeline UI. The
 * FE should not need to look at this — it can use the `featureLabel`
 * and `featureAccent` fields returned by `fetchActivities`.
 */

const FEATURE_META = {
  project:        { label: 'Project',       accent: 'indigo'  },
  team:           { label: 'Team',          accent: 'amber'   },
  'task-board':   { label: 'Task Board',    accent: 'sky'     },
  todos:          { label: 'To-dos',        accent: 'emerald' },
  'message-board':{ label: 'Message Board', accent: 'violet'  },
  files:          { label: 'Files',         accent: 'cyan'    },
  chat:           { label: 'Chat',          accent: 'pink'    },
  schedule:       { label: 'Schedule',      accent: 'orange'  },
  announcements:  { label: 'Announcements', accent: 'rose'    },
  testCases:      { label: 'Test Cases',    accent: 'violet' },
  testSuites:     { label: 'Test Suites',   accent: 'violet' },
};

/** Map (feature, action) → user-facing verb phrase used in the timeline.
 *  Keeps the verb grammar consistent across features without forcing
 *  every recorder to spell it out. */
const ACTION_VERB = {
  'project.created':          'created the project',
  'project.updated':          'updated the project',
  'project.deleted':          'deleted the project',

  'team.member_added':        'added',
  'team.member_removed':      'removed',

  'task-board.task_created':  'created task',
  'task-board.task_updated':  'updated task',
  'task-board.task_deleted':  'deleted task',
  'task-board.task_moved':    'moved task',
  'task-board.task_completed':'completed task',
  'task-board.task_archived': 'archived task',
  'task-board.task_restored': 'restored task',
  'task-board.task_commented':'commented on task',
  'task-board.subtask_created': 'added subtask',
  'task-board.subtask_updated': 'updated subtask',
  'task-board.subtask_deleted': 'deleted subtask',
  'task-board.comment_updated': 'updated comment',
  'task-board.comment_deleted': 'deleted comment',
  'task-board.attachment_added': 'added attachment',

  'todos.list_created':       'created to-do list',
  'todos.list_updated':       'updated to-do list',
  'todos.list_deleted':       'deleted to-do list',
  'todos.item_created':       'added to-do',
  'todos.item_updated':       'updated to-do',
  'todos.item_completed':     'completed to-do',
  'todos.item_reopened':      'reopened to-do',
  'todos.item_deleted':       'deleted to-do',

  'message-board.message_posted':  'posted',
  'message-board.message_updated': 'updated',
  'message-board.message_deleted': 'deleted',

  'files.document_created':   'created a document',
  'files.document_updated':   'updated a document',
  'files.document_deleted':   'deleted a document',
  'files.file_uploaded':      'uploaded a file',
  'files.file_deleted':       'deleted a file',
  'files.commented':          'added a comment',
  'files.comment_updated':   'updated a comment',
  'files.comment_deleted':   'deleted a comment',

  'chat.message_posted':      'posted',
  'chat.message_updated':     'updated',
  'chat.message_deleted':     'deleted',

  'schedule.event_created':   'created a schedule event',
  'schedule.event_updated':   'updated a schedule event',
  'schedule.event_deleted':   'deleted a schedule event',

  'announcements.created':   'created an announcement',
  'announcements.updated':    'updated an announcement',
  'announcements.deleted':    'deleted an announcement',
  'announcements.pinned':     'pinned an announcement',
  'announcements.unpinned':   'unpinned an announcement',
  'announcements.restored':   'restored an announcement',

  'testCases.created':        'created a test case',
  'testCases.updated':        'updated a test case',
  'testCases.deleted':        'deleted a test case',
  'testCases.status_changed':  'changed test case status',
  'testCases.priority_changed':'changed test case priority',
  'testCases.commented':      'commented on test case',
  'testCases.step_created':   'added test step',
  'testCases.step_updated':    'updated test step',
  'testCases.step_deleted':    'deleted test step',
  'testCases.attachment_added':  'added attachment',
  'testCases.attachment_deleted': 'deleted attachment',

  'testSuites.created':       'created a test suite',
  'testSuites.updated':      'updated a test suite',
  'testSuites.deleted':      'deleted a test suite',
};

const FEATURE_KEYS = Object.keys(FEATURE_META);

/**
 * Fire-and-forget activity insert.
 *
 * Always awaits internally — the caller can `await` or fire-and-forget;
 * either way, an internal error is swallowed (logged) so the parent
 * request isn't affected.
 */
async function recordActivity(pool, payload) {
  const {
    projectId,
    actorId,
    feature,
    action,
    targetType,
    targetId = null,
    targetLabel = null,
    meta = null,
  } = payload || {};

  if (!projectId || !actorId || !feature || !action || !targetType) {
    // Bad payload — log and bail. We never throw.
    console.warn('[activity] recordActivity: missing required fields', payload);
    return;
  }
  if (!FEATURE_META[feature]) {
    console.warn('[activity] recordActivity: unknown feature', feature);
    return;
  }

  try {
    await pool.query(
      `INSERT INTO project_activities
         (project_id, actor_id, feature, action, target_type, target_id, target_label, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        actorId,
        feature,
        action,
        targetType,
        targetId == null ? null : String(targetId),
        targetLabel == null ? null : String(targetLabel).slice(0, 255),
        meta == null ? null : JSON.stringify(meta),
      ]
    );
  } catch (err) {
    // Swallow — activity is best-effort. Log enough to debug.
    console.error('[activity] recordActivity failed:', err.message, payload);
  }
}

/**
 * Map a DB row + joined actor to the shape the frontend expects.
 */
function hydrateActivity(row, actor) {
  const meta = row.meta && typeof row.meta === 'string'
    ? safeParseJson(row.meta)
    : (row.meta || null);
  return {
    id: row.id,
    projectId: row.project_id,
    actorId: row.actor_id,
    actor: actor
      ? `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || actor.email || 'Unknown'
      : 'Unknown',
    initials: actor ? `${(actor.first_name || '?')[0] || '?'}${(actor.last_name || '?')[0] || '?'}`.toUpperCase() : '??',
    avatar: actor ? actor.avatar_url || null : null,
    feature: row.feature,
    featureLabel: (FEATURE_META[row.feature] || { label: row.feature }).label,
    featureAccent: (FEATURE_META[row.feature] || { accent: 'indigo' }).accent,
    action: row.action,
    actionVerb: ACTION_VERB[`${row.feature}.${row.action}`] || `${row.action} ${row.target_type}`,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label || null,
    meta,
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function safeParseJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

module.exports = {
  FEATURE_META,
  FEATURE_KEYS,
  ACTION_VERB,
  recordActivity,
  hydrateActivity,
};
