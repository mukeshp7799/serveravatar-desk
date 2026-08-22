# Seravavatar Hub — Permissions Audit & Recommended Permission List

**Date:** 2026-08-21
**Status:** Analysis of current system vs. recommended design

---

## 1. Current Permissions in Database (64 total)

```
Users                 users.view_own, users.edit_own, users.view_all, users.edit_all, users.create, users.delete
HR                    hr.view_directory, hr.manage_employees, hr.view_reports
Leave                 leave.view_own, leave.apply, leave.view_team, leave.approve, leave.manage_all, leave.configure_types
Projects              projects.view, projects.create, projects.edit, projects.delete, projects.manage_members
Tasks                 tasks.view, tasks.create, tasks.edit, tasks.delete, tasks.assign
Documents             documents.view_own, documents.view_all, documents.upload
Discussions           discussions.view, discussions.create, discussions.post, discussions.delete
Notifications         notifications.view, notifications.manage
Reports               reports.view, reports.export
Attendance            attendance.clock_in_out, attendance.view_own, attendance.view_team,
                      attendance.manage_all, attendance.export,
                      attendance.break_adjustment.request, attendance.break_adjustment.manage
Calendar              calendar.view, calendar.view_all, calendar.manage_events, calendar.manage_holidays
Activity Logs         activity_logs.view_own, activity_logs.view_all
Admin                 admin.settings, admin.departments, admin.designations, admin.roles
Timelog               timelog.view_own, timelog.create
Auth                  auth.login, auth.logout
```

---

## 2. API Routes & Permission Enforcement Audit

### 2.1 Routes with PROPER `requirePermission` middleware

| Route | Middleware | Permission |
|---|---|---|
| `PUT /company-settings` | `requirePermission` | `admin.settings` |
| `GET /announcements/lookups` | `requirePermission` | `announcements.create` |
| `POST /announcements` | `requirePermission` | `announcements.create` |
| `PUT /announcements/:id` | `requirePermission` | `announcements.create` |
| `DELETE /announcements/:id` | `requirePermission` | `announcements.manage` |
| `PATCH /announcements/:id/pin` | `requirePermission` | `announcements.manage` |
| `POST /announcements/:id/restore` | `requirePermission` | `announcements.manage` |
| `GET /reports/export/:report` | `requirePermission` | `reports.export` |
| `GET /reports/export` | `requirePermission` | `reports.export` |

### 2.2 Routes with `requireProjectMember` middleware (project-scoped)

| Route | Notes |
|---|---|
| All `/projects/:id/*` routes | GET, PUT, DELETE projects + members |
| All `/projects/:id/members` routes | POST/DELETE members |
| All `/projects/:id/todolists` routes | |
| All `/task-boards/*` routes | Board, columns, tasks, subtasks, comments, attachments |
| All `/projects/:projectId/test-cases/*` routes | (most use requireProjectMember) |
| All `/projects/:projectId/test-suites/*` routes | (most use requireProjectMember) |
| All `/projects/:projectId/chat` routes | Chat messages |
| All `/projects/:projectId/messages` routes | Project messages |
| `GET /projects/:projectId/schedule` | Project schedule |

### 2.3 Routes with inline permission checks (`req.user.permissions.includes(...)`)

| Route | Permission Check | Status |
|---|---|---|
| **Auth** | | |
| `GET /users` | `users.view_all` | ✅ Enforced |
| `GET /users/:id` | `users.view_all` (or self) | ✅ Enforced |
| `POST /users` | `users.create` | ✅ Enforced |
| `PUT /users/:id` | `users.edit_all` (or self) | ✅ Enforced |
| `DELETE /users/:id` | `users.delete` | ✅ Enforced |
| **Employees** | | |
| `GET /employees` | `users.view_all` | ✅ Enforced |
| `GET /employees/:id/profile` | `users.view_all` or self | ✅ Enforced |
| `PUT /employees/:id` | `users.edit_all` | ✅ Enforced |
| **Departments** | | |
| `GET /departments` | None | ⚠️ No check |
| `POST /departments` | None | ⚠️ No check |
| `PUT /departments/:id` | None | ⚠️ No check |
| `DELETE /departments/:id` | None | ⚠️ No check |
| **Designations** | | |
| `GET /designations` | None | ⚠️ No check |
| **Discussions** | | |
| `GET /discussions` | `discussions.view` | ✅ Enforced |
| `POST /discussions` | `discussions.create` | ✅ Enforced |
| `POST /discussions/:id/messages` | `discussions.post` | ✅ Enforced |
| `DELETE /discussions/:id` | `discussions.delete` or creator | ✅ Enforced |
| **Documents** | | |
| `GET /documents` | `documents.view_own` / `documents.view_all` | ✅ Enforced |
| `POST /documents/upload` | `documents.upload` | ✅ Enforced |
| `PUT /documents/:id` | `documents.upload` | ✅ Enforced |
| **Attendance** | | |
| `POST /attendance/clock-in` | `attendance.clock_in_out` | ✅ Enforced |
| `POST /attendance/start-break` | `attendance.clock_in_out` | ✅ Enforced |
| `POST /attendance/end-break` | `attendance.clock_in_out` | ✅ Enforced |
| `POST /attendance/clock-out` | `attendance.clock_in_out` | ✅ Enforced |
| `GET /attendance/today` | `attendance.view_own` | ✅ Enforced |
| `GET /attendance/history` | `attendance.view_own` | ✅ Enforced |
| `GET /attendance/my-history` | `attendance.clock_in_out` | ✅ Enforced |
| `GET /attendance/breaks/:id` | Own or `attendance.view_team` | ✅ Enforced |
| `GET /attendance/stats` | `attendance.view_team` or `attendance.manage_all` | ✅ Enforced |
| `GET /attendance/team` | `attendance.view_team` or `attendance.manage_all` | ✅ Enforced |
| `GET /attendance/all` | `attendance.manage_all` | ✅ Enforced |
| `PUT /attendance/:id` | `attendance.manage_all` | ✅ Enforced |
| `GET /attendance/analytics/summary` | `attendance.manage_all` or `attendance.view_team` | ✅ Enforced |
| `POST /attendance/:id/breaks` | `attendance.clock_in_out` | ✅ Enforced |
| `PUT /attendance/:id/breaks/:breakId` | `attendance.clock_in_out` | ✅ Enforced |
| `DELETE /attendance/:id/breaks/:breakId` | `attendance.clock_in_out` | ✅ Enforced |
| `POST /attendance/break-adjustments` | `attendance.break_adjustment.request` | ✅ Enforced |
| `GET /attendance/break-adjustments` | Own or `attendance.break_adjustment.manage` | ✅ Enforced |
| `PUT /attendance/break-adjustments/:id/approve` | `attendance.break_adjustment.manage` | ✅ Enforced |
| `PUT /attendance/break-adjustments/:id/reject` | `attendance.break_adjustment.manage` | ✅ Enforced |
| **Leave** | | |
| `GET /leaves/types` | `leave.manage_all` or `users.edit_all` | ✅ Enforced |
| `POST /leaves/types` | `leave.manage_all` or `users.edit_all` | ✅ Enforced |
| `PUT /leaves/types/:id` | `leave.manage_all` or `users.edit_all` | ✅ Enforced |
| `DELETE /leaves/types/:id` | `leave.manage_all` or `users.edit_all` | ✅ Enforced |
| `GET /leaves/balance` | `leave.manage_all` or `users.edit_all` | ✅ Enforced |
| `GET /leaves/balance/:userId` | `leave.manage_all` or `users.edit_all` | ✅ Enforced |
| `GET /leaves/allocations` | `leave.manage_all` or `users.edit_all` | ✅ Enforced |
| `PUT /leaves/allocations/:id` | `leave.manage_all` or `users.edit_all` | ✅ Enforced |
| `GET /leaves` | Scoped by permissions | ✅ Enforced |
| `POST /leaves` | `leave.apply` | ✅ Enforced |
| `PUT /leaves/:id/approve` | `leave.approve` | ✅ Enforced |
| `PUT /leaves/:id/cancel` | Own or `leave.manage_all` | ✅ Enforced |
| `GET /leaves/calendar` | Scoped | ✅ Enforced |
| **Calendar** | | |
| `GET /calendar/holidays` | `auth` (anyone) | ⚠️ No permission check |
| `POST /calendar/holidays` | `canManageHolidays` → `calendar.manage_holidays` | ✅ Enforced |
| `PUT /calendar/holidays/:id` | `canManageHolidays` → `calendar.manage_holidays` | ✅ Enforced |
| `DELETE /calendar/holidays/:id` | `canManageHolidays` → `calendar.manage_holidays` | ✅ Enforced |
| `GET /calendar/events` | `auth` (anyone) | ⚠️ No permission check |
| `POST /calendar/events` | `canManageEvents` → `calendar.manage_events` | ✅ Enforced |
| `PUT /calendar/events/:id` | `canManageEvents` → `calendar.manage_events` | ✅ Enforced |
| `DELETE /calendar/events/:id` | `canManageEvents` → `calendar.manage_events` | ✅ Enforced |
| `GET /calendar/view` | `auth` (anyone) | ⚠️ No permission check |
| `GET /calendar/dashboard` | `auth` (anyone) | ⚠️ No permission check |
| **Reports** | | |
| `GET /reports/lookups` | `auth` (anyone) | ⚠️ No check |
| `GET /reports/summary` | `auth` (anyone) | ⚠️ No check |
| `GET /reports/employees` | `auth` (anyone) | ⚠️ No check |
| `GET /reports/attendance` | `auth` (anyone) | ⚠️ No check |
| `GET /reports/leaves` | `auth` (anyone) | ⚠️ No check |
| `GET /reports/projects` | `auth` (anyone) | ⚠️ No check |
| `GET /reports/tasks` | `auth` (anyone) | ⚠️ No check |
| `GET /reports/departments` | `auth` (anyone) | ⚠️ No check |
| `GET /reports/charts` | `auth` (anyone) | ⚠️ No check |
| `GET /reports/export/*` | `reports.export` | ✅ Enforced |
| **Invitations** | | |
| `POST /invitations/:token/accept` | `auth` (anyone) | ⚠️ Should check token validity |
| `POST /invitations/:token/decline` | `auth` (anyone) | ⚠️ Should check token validity |
| `PUT /invitations/:id/resend` | `auth` (anyone) | ⚠️ No check |
| `DELETE /invitations/:id` | `auth` (anyone) | ⚠️ No check |
| **Projects** | | |
| `GET /projects` | `auth` (anyone, filtered by member) | ⚠️ No check |
| `POST /projects` | `auth` (anyone) | ⚠️ No check (should be `projects.create`) |
| `PUT /projects/:id` | `auth` (anyone) | ⚠️ No check (should be `projects.edit`) |
| `DELETE /projects/:id` | `auth` (anyone) | ⚠️ No check (should be `projects.delete`) |
| `POST /projects/:id/members` | `auth` (anyone) | ⚠️ No check (should be `projects.manage_members`) |
| `DELETE /projects/:id/members/:userId` | `auth` (anyone) | ⚠️ No check (should be `projects.manage_members`) |
| `POST /projects/:id/leave` | `auth` (member only) | ✅ Via `requireProjectMember` |
| `POST /projects/:id/restore` | `auth` (anyone) | ⚠️ No check |
| **Todolists** | | |
| All `/projects/:projectId/todos/*` | `auth` | ⚠️ No project membership check |
| **TaskBoard** | | |
| Most task operations | `requireProjectMember` | ✅ Enforced |
| `PUT /task-columns/:columnId` | `auth` | ⚠️ No project membership check |
| `DELETE /task-columns/:columnId` | `auth` | ⚠️ No project membership check |
| **Test Suites** | | |
| `POST /projects/:projectId/test-suites` | `requireMemberOrOwner` | ✅ Enforced |
| `PUT /projects/:projectId/test-suites/:suiteId` | `requireProjectMember` | ✅ Enforced |
| `DELETE /projects/:projectId/test-suites/:suiteId` | `requireProjectMember` | ✅ Enforced |
| **Test Cases** | | |
| `GET /projects/:projectId/test-cases` | `requireProjectMember` | ✅ Enforced |
| `POST /projects/:projectId/test-cases` | `requireMemberOrOwner` | ✅ Enforced |
| `PUT /projects/:projectId/test-cases/:caseId` | `requireProjectMember` | ✅ Enforced |
| `DELETE /projects/:projectId/test-cases/:caseId` | `requireProjectMember` | ✅ Enforced |
| Steps, comments, attachments | `requireCaseProjectMember` | ✅ Enforced |
| **Timelogs** | | |
| `GET /timelogs` | `auth` (anyone) | ⚠️ No check |
| `POST /timelogs` | `auth` (anyone) | ⚠️ No check (should be `timelog.create`) |
| `DELETE /timelogs/:id` | `auth` (anyone) | ⚠️ No check |
| **Notifications** | | |
| `GET /notifications` | `auth` (anyone) | ⚠️ No check |
| `PUT /notifications/:id/read` | `auth` (anyone) | ⚠️ No check |
| `PUT /notifications/read-all` | `auth` (anyone) | ⚠️ No check |
| **Notification Preferences** | | |
| `GET /notification-preferences` | `auth` (anyone) | ⚠️ No check |
| `PUT /notification-preferences` | `auth` (anyone) | ⚠️ No check |
| **Activity Logs** | | |
| `GET /activity-logs` | `auth` (anyone) | ⚠️ No check |
| `GET /activity-logs/recent` | `auth` (anyone) | ⚠️ No check |
| `GET /activity-logs/modules` | `auth` (anyone) | ⚠️ No check |
| `GET /activity-logs/actions` | `auth` (anyone) | ⚠️ No check |
| **Roles** | | |
| `GET /roles` | `auth` (anyone) | ⚠️ No check |
| `GET /roles/:id/permissions` | `auth` (anyone) | ⚠️ No check |
| `POST /roles` | `auth` (anyone) | ⚠️ No check (should be `admin.roles`) |
| `PUT /roles/:id` | `auth` (anyone) | ⚠️ No check (should be `admin.roles`) |
| `DELETE /roles/:id` | `auth` (anyone) | ⚠️ No check (should be `admin.roles`) |
| `PUT /roles/:id/permissions` | `auth` (anyone) | ⚠️ No check (should be `admin.roles`) |
| **Dashboard** | | |
| `GET /dashboard` | `auth` (anyone) | ⚠️ No check |
| **Email Logs** | | |
| `GET /email-logs` | `auth` (anyone) | ⚠️ No check |
| `GET /email-logs/:id` | `auth` (anyone) | ⚠️ No check |
| **Schedule** | | |
| All `/schedule/*` routes | `auth` (anyone) | ⚠️ No check |

---

## 3. Recommended Comprehensive Permission List

### 3.1 Module: Users
| Permission Key | Label | Used For |
|---|---|---|
| `users.view_own` | View Own Profile | Reading own user profile |
| `users.edit_own` | Edit Own Profile | Editing own profile fields |
| `users.view_all` | View All Users | Listing and viewing all user accounts |
| `users.create` | Create Users | Creating new user accounts |
| `users.edit_all` | Edit All Users | Editing any user account |
| `users.delete` | Delete Users | Deleting user accounts |

### 3.2 Module: Auth
| Permission Key | Label | Used For |
|---|---|---|
| `auth.login` | Login | Logging into the application |
| `auth.logout` | Logout | Logging out of the application |

### 3.3 Module: Employees
| Permission Key | Label | Used For |
|---|---|---|
| `employees.view` | View Employees | Viewing employee directory/list |
| `employees.view_all` | View All Employees | Viewing full employee details |
| `employees.create` | Create Employees | Adding new employees |
| `employees.edit` | Edit Employees | Editing employee records |
| `employees.delete` | Delete Employees | Removing employee records |
| `employees.view_profile` | View Employee Profile | Viewing detailed employee profile |
| `employees.edit_profile` | Edit Employee Profile | Editing employee profile fields |

### 3.4 Module: Departments
| Permission Key | Label | Used For |
|---|---|---|
| `departments.view` | View Departments | Viewing department list |
| `departments.create` | Create Departments | Creating departments |
| `departments.edit` | Edit Departments | Editing department details |
| `departments.delete` | Delete Departments | Deleting departments |

### 3.5 Module: Designations
| Permission Key | Label | Used For |
|---|---|---|
| `designations.view` | View Designations | Viewing designation list |
| `designations.create` | Create Designations | Creating designations |
| `designations.edit` | Edit Designations | Editing designations |
| `designations.delete` | Delete Designations | Deleting designations |

### 3.6 Module: Projects
| Permission Key | Label | Used For |
|---|---|---|
| `projects.view` | View Projects | Viewing projects (own) |
| `projects.view_all` | View All Projects | Viewing all projects in system |
| `projects.create` | Create Projects | Creating new projects |
| `projects.edit` | Edit Projects | Editing project details |
| `projects.delete` | Delete Projects | Deleting projects |
| `projects.manage_members` | Manage Project Members | Adding/removing project members |
| `projects.view_members` | View Project Members | Viewing project member list |
| `projects.archive` | Archive Projects | Archiving/restoring projects |

### 3.7 Module: Tasks (TaskBoard)
| Permission Key | Label | Used For |
|---|---|---|
| `tasks.view` | View Tasks | Viewing tasks within projects |
| `tasks.create` | Create Tasks | Creating new tasks |
| `tasks.edit` | Edit Tasks | Editing task details |
| `tasks.delete` | Delete Tasks | Deleting tasks |
| `tasks.assign` | Assign Tasks | Assigning tasks to users |
| `tasks.move` | Move Tasks | Moving tasks between columns |
| `tasks.restore` | Restore Tasks | Restoring deleted tasks |
| `tasks.permanent_delete` | Permanently Delete Tasks | Hard-deleting tasks |

### 3.8 Module: TodoLists
| Permission Key | Label | Used For |
|---|---|---|
| `todolists.view` | View Todo Lists | Viewing project todo lists |
| `todolists.create` | Create Todo Lists | Creating todo lists |
| `todolists.manage` | Manage Todo Lists | Editing/deleting todo lists |
| `todolists.manage_items` | Manage Todo Items | Adding/editing/removing items |

### 3.9 Module: Discussions
| Permission Key | Label | Used For |
|---|---|---|
| `discussions.view` | View Discussions | Viewing discussion threads |
| `discussions.create` | Create Discussions | Creating new discussions |
| `discussions.post` | Post Messages | Posting in discussions |
| `discussions.edit` | Edit Own Messages | Editing own messages |
| `discussions.delete` | Delete Discussions | Deleting discussions or messages |
| `discussions.react` | React to Messages | Adding reactions to messages |

### 3.10 Module: Documents
| Permission Key | Label | Used For |
|---|---|---|
| `documents.view_own` | View Own Documents | Viewing own uploaded documents |
| `documents.view_all` | View All Documents | Viewing all documents in system |
| `documents.create` | Create Documents | Creating document records |
| `documents.edit` | Edit Documents | Editing document metadata |
| `documents.upload` | Upload Documents | Uploading file attachments |
| `documents.delete` | Delete Documents | Deleting documents |
| `documents.view_comments` | View Document Comments | Viewing comments on documents |
| `documents.comment` | Comment on Documents | Adding comments to documents |
| `documents.react` | React to Documents | Adding reactions to documents |

### 3.11 Module: Leave
| Permission Key | Label | Used For |
|---|---|---|
| `leave.view_own` | View Own Leaves | Viewing own leave requests |
| `leave.apply` | Apply for Leave | Submitting leave requests |
| `leave.view_team` | View Team Leaves | Viewing team leave calendar |
| `leave.approve` | Approve Leaves | Approving/rejecting leave requests |
| `leave.manage_all` | Manage All Leaves | Managing all leave types and allocations |
| `leave.configure_types` | Configure Leave Types | Creating/editing leave type definitions |
| `leave.cancel` | Cancel Own Leaves | Canceling own leave requests |

### 3.12 Module: Attendance
| Permission Key | Label | Used For |
|---|---|---|
| `attendance.clock_in_out` | Clock In/Out | Clocking in, out, breaks |
| `attendance.view_own` | View Own Attendance | Viewing own attendance records |
| `attendance.view_team` | View Team Attendance | Viewing team attendance |
| `attendance.manage_all` | Manage All Attendance | Managing all attendance records |
| `attendance.export` | Export Attendance | Exporting attendance reports |
| `attendance.break_adjustment.request` | Request Break Adjustment | Submitting break adjustment requests |
| `attendance.break_adjustment.manage` | Manage Break Adjustments | Approving/rejecting break adjustments |

### 3.13 Module: Calendar
| Permission Key | Label | Used For |
|---|---|---|
| `calendar.view` | View Calendar | Viewing calendar events |
| `calendar.view_all` | View All Events | Viewing all events (not just own) |
| `calendar.manage_events` | Manage Events | Creating/editing/deleting calendar events |
| `calendar.manage_holidays` | Manage Holidays | Creating/editing/deleting holidays |

### 3.14 Module: Reports
| Permission Key | Label | Used For |
|---|---|---|
| `reports.view` | View Reports | Viewing all report data |
| `reports.view_summary` | View Report Summary | Viewing summary dashboard |
| `reports.view_employees` | View Employee Reports | Viewing employee-specific reports |
| `reports.view_attendance` | View Attendance Reports | Viewing attendance reports |
| `reports.view_leaves` | View Leave Reports | Viewing leave reports |
| `reports.view_projects` | View Project Reports | Viewing project reports |
| `reports.view_tasks` | View Task Reports | Viewing task reports |
| `reports.view_departments` | View Department Reports | Viewing department reports |
| `reports.view_charts` | View Report Charts | Viewing charts and visualizations |
| `reports.export` | Export Reports | Exporting report data |

### 3.15 Module: Notifications
| Permission Key | Label | Used For |
|---|---|---|
| `notifications.view` | View Notifications | Viewing own notifications |
| `notifications.manage` | Manage Notifications | Managing notification settings |
| `notifications.mark_read` | Mark as Read | Marking notifications as read |
| `notifications.delete` | Delete Notifications | Deleting notifications |

### 3.16 Module: Activity Logs
| Permission Key | Label | Used For |
|---|---|---|
| `activity_logs.view_own` | View Own Activity | Viewing own activity history |
| `activity_logs.view_all` | View All Activity | Viewing all users' activity logs |

### 3.17 Module: Admin / Settings
| Permission Key | Label | Used For |
|---|---|---|
| `admin.settings` | Manage Settings | Managing company settings |
| `admin.departments` | Manage Departments | Managing departments (admin) |
| `admin.designations` | Manage Designations | Managing designations (admin) |
| `admin.roles` | Manage Roles & Permissions | Creating/editing roles and permissions |
| `admin.view_logs` | View System Logs | Viewing email logs, activity logs |

### 3.18 Module: Timelog
| Permission Key | Label | Used For |
|---|---|---|
| `timelog.view_own` | View Own Timelogs | Viewing own time entries |
| `timelog.view_all` | View All Timelogs | Viewing all time entries |
| `timelog.create` | Create Timelog | Creating time entries |
| `timelog.edit` | Edit Timelogs | Editing time entries |
| `timelog.delete` | Delete Timelogs | Deleting time entries |

### 3.19 Module: Announcements
| Permission Key | Label | Used For |
|---|---|---|
| `announcements.view` | View Announcements | Viewing announcements |
| `announcements.create` | Create Announcements | Creating/publishing announcements |
| `announcements.manage` | Manage Announcements | Editing/deleting/pinning announcements |

### 3.20 Module: Invitations
| Permission Key | Label | Used For |
|---|---|---|
| `invitations.view` | View Invitations | Viewing pending invitations |
| `invitations.send` | Send Invitations | Sending project invitations |
| `invitations.resend` | Resend Invitations | Resending invitation emails |
| `invitations.revoke` | Revoke Invitations | Canceling pending invitations |

### 3.21 Module: Test Management
| Permission Key | Label | Used For |
|---|---|---|
| `tests.view` | View Test Cases | Viewing test cases and suites |
| `tests.create` | Create Tests | Creating test suites and cases |
| `tests.edit` | Edit Tests | Editing test cases |
| `tests.delete` | Delete Tests | Deleting test cases |
| `tests.execute` | Execute Tests | Changing test case status/priority |

### 3.22 Module: Project Chat
| Permission Key | Label | Used For |
|---|---|---|
| `chat.view` | View Project Chat | Viewing project chat messages |
| `chat.send` | Send Messages | Posting in project chat |
| `chat.edit` | Edit Own Messages | Editing own chat messages |
| `chat.delete` | Delete Messages | Deleting chat messages |
| `chat.react` | React to Messages | Adding reactions to chat |

### 3.23 Module: Schedule
| Permission Key | Label | Used For |
|---|---|---|
| `schedule.view` | View Schedules | Viewing project schedules |
| `schedule.manage` | Manage Schedules | Creating/editing schedule entries |

---

## 4. Gap Analysis Summary

### High Priority Gaps (security-sensitive, should be fixed)
1. **Roles routes** — All operations (CRUD roles, assign permissions) require `admin.roles` but no middleware
2. **Departments routes** — All operations have no permission middleware at all
3. **Projects** — `POST /projects`, `PUT /projects/:id`, `DELETE /projects/:id`, `POST /projects/:id/members`, `DELETE /projects/:id/members/:userId` lack project-level authorization checks
4. **Todolists** — All routes lack `requireProjectMember` middleware
5. **Reports** — All non-export report routes are open to any authenticated user

### Medium Priority Gaps
6. **Invitations** — Resend/revoke operations have no permission checks
7. **Timelogs** — All operations are open to any authenticated user
8. **Notifications** — Mark-as-read and read-all are open
9. **Notification Preferences** — All operations open
10. **Activity Logs** — All routes open
11. **Dashboard** — Open to any authenticated user
12. **Email Logs** — All routes open
13. **Schedule** — All routes open
14. **Designations** — All routes open
15. **TaskBoard column operations** — `PUT /task-columns/:columnId`, `DELETE /task-columns/:columnId` lack `requireProjectMember`

### Lower Priority (open by design — informational)
16. **Calendar holidays GET** — informational, low risk
17. **Calendar events GET** — informational, low risk
18. **Calendar view/dashboard GET** — informational, low risk

---

## 5. Recommended New Permissions to Add

### Missing from Current DB (recommended additions)

**Departments:**
- `departments.view`, `departments.create`, `departments.edit`, `departments.delete`

**Designations:**
- `designations.view`, `designations.create`, `designations.edit`, `designations.delete`

**Projects:**
- `projects.view_all`, `projects.view_members`, `projects.archive`

**Tasks:**
- `tasks.move`, `tasks.restore`, `tasks.permanent_delete`

**TodoLists (new module):**
- `todolists.view`, `todolists.create`, `todolists.manage`, `todolists.manage_items`

**Documents:**
- `documents.create`, `documents.edit`, `documents.delete`, `documents.view_comments`, `documents.comment`, `documents.react`

**Discussions:**
- `discussions.edit`, `discussions.react`

**Leave:**
- `leave.cancel`

**Attendance:**
- `attendance.view_own` (already exists conceptually but verify)

**Calendar:**
- `calendar.view_all`

**Reports:**
- `reports.view_summary`, `reports.view_employees`, `reports.view_attendance`, `reports.view_leaves`, `reports.view_projects`, `reports.view_tasks`, `reports.view_departments`, `reports.view_charts`

**Notifications:**
- `notifications.mark_read`, `notifications.delete`

**Timelog:**
- `timelog.edit`, `timelog.delete`

**Invitations (new module):**
- `invitations.view`, `invitations.send`, `invitations.resend`, `invitations.revoke`

**Test Management (new module):**
- `tests.view`, `tests.create`, `tests.edit`, `tests.delete`, `tests.execute`

**Project Chat (new module):**
- `chat.view`, `chat.send`, `chat.edit`, `chat.delete`, `chat.react`

**Schedule (new module):**
- `schedule.view`, `schedule.manage`

**Admin:**
- `admin.view_logs`
