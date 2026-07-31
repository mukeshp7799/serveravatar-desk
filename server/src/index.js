require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const roleRoutes = require("./routes/roles");
const departmentRoutes = require("./routes/departments");
const designationRoutes = require("./routes/designations");
const leaveRoutes = require("./routes/leaves");
const projectRoutes = require("./routes/projects");
// NOTE: legacy "tasks.js" routes were removed (the `tasks` table was dropped in favor of `tb_tasks`).
// All /api/tasks/* endpoints now come from taskBoard.js below.
const discussionRoutes = require("./routes/discussions");
const notificationRoutes = require("./routes/notifications");
const announcementRoutes = require("./routes/announcements");
const timelogRoutes = require("./routes/timelogs");
const documentRoutes = require("./routes/documents");
const dashboardRoutes = require("./routes/dashboard");
const emailLogRoutes = require("./routes/emailLogs");
const projectMessageRoutes = require("./routes/projectMessages");
const projectChatRoutes = require("./routes/projectChat");
const todoRoutes = require("./routes/todos");
const scheduleRoutes = require("./routes/schedule");
const taskBoardRoutes = require("./routes/taskBoard");
const testSuiteRoutes = require("./routes/testSuites");
const testCaseRoutes = require("./routes/testCases");
const invitationRoutes = require("./routes/invitations");
const projectInvitationRoutes = require("./routes/projectInvitations");
const { langMiddleware } = require("./i18n");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
// i18n: detect language from ?lang= or Accept-Language, attach to req.lang
app.use(langMiddleware);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/designations", designationRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/projects", projectRoutes);
// /api/tasks/* comes from taskBoardRoutes below (mounted at /api)
app.use("/api/discussions", discussionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/timelogs", timelogRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/email-logs", emailLogRoutes);
app.use("/api", projectMessageRoutes);
app.use("/api", projectChatRoutes);
app.use("/api", todoRoutes);
app.use("/api", scheduleRoutes);
app.use("/api", taskBoardRoutes);
app.use("/api", testSuiteRoutes);
app.use("/api", testCaseRoutes);
app.use("/api/projects", projectInvitationRoutes); // /api/projects/:id/invitations
app.use("/api/invitations", invitationRoutes);   // /api/invitations/:token + /api/invitations/:id/*

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler — translate "Internal server error" via i18n
const { t } = require("./i18n");
app.use((err, req, res, next) => {
  console.error(err.stack);
  const lang = req.lang || "en";
  res
    .status(500)
    .json({ error: t(lang, "errors.internalServerError"), message: err.message });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Serveravatar Hub API server running on port ${PORT}`);
});
