// HTML email templates for Serveravatar Hub.
// All templates share a common wrapper with a colored top bar and a CTA button.

const SITE_NAME = "Serveravatar Hub";
const SITE_URL = process.env.SITE_URL || "https://serveravatar-hub.95.217.8.52.nip.io";

function fmtDate(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [, m, d] = s.split("-");
    return `${d}/${m}/${s.slice(0, 4)}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function layout({ accent, title, body, ctaText, ctaUrl, footerNote }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,0.06);">
          <tr><td style="background:${accent};height:6px;"></td></tr>
          <tr><td style="padding:28px 32px 8px 32px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;">${SITE_NAME}</div>
            <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:#0f172a;">${title}</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 24px 32px;font-size:15px;line-height:1.6;color:#334155;">${body}</td></tr>
          ${ctaText && ctaUrl ? `
          <tr><td style="padding:0 32px 24px 32px;" align="left">
            <a href="${ctaUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">${ctaText}</a>
          </td></tr>` : ""}
          <tr><td style="padding:16px 32px 28px 32px;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;">
            ${footerNote || `This is an automated notification from ${SITE_NAME}. You're receiving it because there's an active task or leave request involving you.`}
            <br/><br/>Sent via Ethereal SMTP (test mode) — emails do not actually deliver in this environment.
          </td></tr>
        </table>
        <div style="font-size:11px;color:#94a3b8;margin-top:14px;">${SITE_URL}</div>
      </td></tr>
    </table>
  </body>
</html>`;
}

function taskAssignedEmail({ assigneeName, taskDescription, projectName, dueDate, priority, assignedBy, taskUrl }) {
  const priorityColor = {
    urgent: "#EF4444",
    high: "#F59E0B",
    medium: "#3B82F6",
    low: "#9CA3AF",
  }[priority] || "#3B82F6";

  const subject = `[Task] ${taskDescription} — ${projectName}`;
  const body = `
    <p>Hi <strong>${escapeHtml(assigneeName)}</strong>,</p>
    <p>${escapeHtml(assignedBy || "Someone")} assigned you a new task in <strong>${escapeHtml(projectName)}</strong>:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:4px solid ${priorityColor};border-radius:6px;padding:14px 16px;margin:16px 0;width:100%;">
      <tr><td>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${priorityColor};">${escapeHtml(priority || "medium")} priority</div>
        <div style="font-size:16px;font-weight:600;color:#0f172a;margin-top:4px;">${escapeHtml(taskDescription)}</div>
        ${dueDate ? `<div style="font-size:13px;color:#64748b;margin-top:8px;">📅 Due ${fmtDate(dueDate)}</div>` : ""}
      </td></tr>
    </table>
    <p>Open the task to update its status, leave a comment, or attach files.</p>
  `;
  return {
    subject,
    text: `Hi ${assigneeName},\n\n${assignedBy || "Someone"} assigned you a new task in ${projectName}: "${taskDescription}"${dueDate ? ` (due ${fmtDate(dueDate)})` : ""}.\n\nOpen: ${taskUrl}`,
    html: layout({ accent: priorityColor, title: "New task assigned to you", body, ctaText: "Open task", ctaUrl: taskUrl }),
  };
}

function leaveRequestSubmittedEmail({ managerName, employeeName, leaveType, startDate, endDate, days, reason, leaveUrl }) {
  const subject = `[Leave] ${employeeName} requested ${leaveType} (${days} day${days === 1 ? "" : "s"})`;
  const body = `
    <p>Hi <strong>${escapeHtml(managerName)}</strong>,</p>
    <p><strong>${escapeHtml(employeeName)}</strong> has submitted a leave request that needs your review:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:4px solid #6366F1;border-radius:6px;padding:14px 16px;margin:16px 0;width:100%;">
      <tr><td>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6366F1;">${escapeHtml(leaveType)}</div>
        <div style="font-size:15px;color:#0f172a;margin-top:6px;">📅 ${fmtDate(startDate)} → ${fmtDate(endDate)} <span style="color:#64748b;">(${days} day${days === 1 ? "" : "s"})</span></div>
        ${reason ? `<div style="font-size:13px;color:#475569;margin-top:8px;font-style:italic;">"${escapeHtml(reason)}"</div>` : ""}
      </td></tr>
    </table>
    <p>Approve or reject the request from the Leave Requests page.</p>
  `;
  return {
    subject,
    text: `Hi ${managerName},\n\n${employeeName} requested ${leaveType} from ${fmtDate(startDate)} to ${fmtDate(endDate)} (${days} days).\n\nReview: ${leaveUrl}`,
    html: layout({ accent: "#6366F1", title: "New leave request awaiting your approval", body, ctaText: "Review request", ctaUrl: leaveUrl }),
  };
}

function leaveRequestDecidedEmail({ employeeName, action, leaveType, startDate, endDate, approverName, reason, leaveUrl }) {
  const isApproved = action === "approved";
  const accent = isApproved ? "#10B981" : "#EF4444";
  const subject = `[Leave] Your ${leaveType} request was ${action}`;
  const body = `
    <p>Hi <strong>${escapeHtml(employeeName)}</strong>,</p>
    <p>Your leave request has been <strong style="color:${accent};">${action}</strong> by ${escapeHtml(approverName)}.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:4px solid ${accent};border-radius:6px;padding:14px 16px;margin:16px 0;width:100%;">
      <tr><td>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${accent};">${escapeHtml(leaveType)}</div>
        <div style="font-size:15px;color:#0f172a;margin-top:6px;">📅 ${fmtDate(startDate)} → ${fmtDate(endDate)}</div>
        ${reason ? `<div style="font-size:13px;color:#475569;margin-top:8px;"><strong>Note:</strong> ${escapeHtml(reason)}</div>` : ""}
      </td></tr>
    </table>
    ${isApproved
      ? `<p>Enjoy your time off. Your leave balance has been deducted accordingly.</p>`
      : `<p>If you have questions, please contact ${escapeHtml(approverName)} directly.</p>`}
  `;
  return {
    subject,
    text: `Hi ${employeeName},\n\nYour ${leaveType} leave request (${fmtDate(startDate)} → ${fmtDate(endDate)}) was ${action} by ${approverName}.${reason ? ` Reason: ${reason}` : ""}\n\nView: ${leaveUrl}`,
    html: layout({ accent, title: `Leave request ${action}`, body, ctaText: "Open leave requests", ctaUrl: leaveUrl }),
  };
}

/**
 * Email Verification email.
 * Sent right after registration. The link expires in `expiresHours` hours.
 */
function emailVerificationEmail({ userName, verificationUrl, expiresHours }) {
  const subject = `[Action required] Verify your ${SITE_NAME} email`;
  const body = `
    <p>Hi <strong>${escapeHtml(userName || "there")}</strong>,</p>
    <p>Welcome to <strong>${SITE_NAME}</strong>! Please confirm your email address so we know it's really you.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:4px solid #6366F1;border-radius:6px;padding:14px 16px;margin:16px 0;width:100%;">
      <tr><td>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6366F1;">Verify your email</div>
        <div style="font-size:14px;color:#0f172a;margin-top:6px;">Click the button below to verify your address. This link will expire in <strong>${expiresHours || 24} hours</strong>.</div>
      </td></tr>
    </table>
    <p>If you didn't create this account, you can safely ignore this email.</p>
  `;
  return {
    subject,
    text: `Hi ${userName || "there"},\n\nWelcome to ${SITE_NAME}! Please verify your email by opening the link below (expires in ${expiresHours || 24} hours):\n\n${verificationUrl}\n\nIf you didn't create this account, you can safely ignore this email.`,
    html: layout({ accent: "#6366F1", title: "Verify your email", body, ctaText: "Verify email", ctaUrl: verificationUrl }),
  };
}

/**
 * Project Invitation email.
 * Sent when a project owner invites an external user by email.
 */
function projectInvitationEmail({ inviteeEmail, inviterName, projectName, roleInProject, invitationUrl, expiresDays }) {
  const subject = `[Invitation] You've been invited to join ${projectName}`;
  const body = `
    <p>Hello,</p>
    <p><strong>${escapeHtml(inviterName)}</strong> has invited you to join the project <strong>${escapeHtml(projectName)}</strong> on Serveravatar Hub.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:4px solid #6366F1;border-radius:6px;padding:14px 16px;margin:16px 0;width:100%;">
      <tr><td>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6366F1;">Role</div>
        <div style="font-size:15px;font-weight:600;color:#0f172a;margin-top:4px;">${escapeHtml(roleInProject || 'Member')}</div>
      </td></tr>
    </table>
    <p>Click the button below to accept or decline this invitation. This link will expire in <strong>${expiresDays || 7} days</strong>.</p>
    <p>If you don't have an account yet, you'll be able to create one after clicking the link. If you already have an account, sign in first and then click the invitation link.</p>
  `;
  return {
    subject,
    text: `Hello,\n\n${inviterName} has invited you to join "${projectName}" on Serveravatar Hub as ${roleInProject || 'Member'}.\n\nOpen the link below to accept or decline:\n${invitationUrl}\n\nThis link expires in ${expiresDays || 7} days.`,
    html: layout({ accent: "#6366F1", title: "You've been invited to a project", body, ctaText: "Accept or Decline Invitation", ctaUrl: invitationUrl }),
  };
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  taskAssignedEmail,
  leaveRequestSubmittedEmail,
  leaveRequestDecidedEmail,
  projectInvitationEmail,
  emailVerificationEmail,
};
