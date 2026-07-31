// Ethereal Mail mailer for Serveravatar Hub.
// - Uses nodemailer with Ethereal SMTP (https://ethereal.email) so emails don't actually
//   deliver but can be previewed via the returned preview URL.
// - If ETHEREAL_USER / ETHEREAL_PASS are not set, creates a fresh test account on startup
//   and persists the credentials to .env so they're reused across restarts.
// - Also writes every sent email to the `email_logs` MySQL table so the app can list them.

const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

const ENV_PATH = path.resolve(__dirname, "../../.env");

let transporter = null;
let transporterReady = null; // Promise<transporter>

function readEnvFile() {
  try {
    if (!fs.existsSync(ENV_PATH)) return {};
    const raw = fs.readFileSync(ENV_PATH, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) {
        let v = m[2];
        // strip surrounding quotes if present
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        out[m[1]] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeEnvKey(key, value) {
  try {
    let raw = "";
    if (fs.existsSync(ENV_PATH)) raw = fs.readFileSync(ENV_PATH, "utf8");
    const lines = raw.split(/\r?\n/);
    let found = false;
    const next = lines.map((line) => {
      if (new RegExp(`^\\s*${key}\\s*=`, "i").test(line)) {
        found = true;
        return `${key}=${value}`;
      }
      return line;
    });
    if (!found) next.push(`${key}=${value}`);
    fs.writeFileSync(ENV_PATH, next.join("\n"), "utf8");
    process.env[key] = value;
  } catch (err) {
    console.error("[mailer] failed to persist env key", key, err.message);
  }
}

async function getTransporter() {
  if (transporter) return transporter;
  if (transporterReady) return transporterReady;

  transporterReady = (async () => {
    // Use credentials from .env (ETHEREAL_USER / ETHEREAL_PASS)
    const user = process.env.ETHEREAL_USER;
    const pass = process.env.ETHEREAL_PASS;

    if (!user || !pass) {
      throw new Error("[mailer] ETHEREAL_USER / ETHEREAL_PASS not set in .env");
    }

    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user, pass },
    });

    return transporter;
  })();

  return transporterReady;
}

const FROM_ADDRESS = process.env.MAIL_FROM || '"Serveravatar Hub" <noreply@serveravatar-hub.local>';

/**
 * Send an email and log it to the email_logs table.
 * Returns { ok, messageId, previewUrl, error }.
 */
async function sendEmail({ to, toName, subject, html, text, type, relatedId, relatedType, triggeredByUserId }) {
  let info = null;
  let previewUrl = null;
  let messageId = null;
  let status = "sent";
  let errorMsg = null;

  try {
    const tx = await getTransporter();
    info = await tx.sendMail({
      from: FROM_ADDRESS,
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      text: text || subject,
      html: html || `<p>${subject}</p>`,
    });
    messageId = info.messageId || null;
    previewUrl = nodemailer.getTestMessageUrl(info) || null;
    console.log(`[mailer] ${type} -> ${to} | preview: ${previewUrl}`);
  } catch (err) {
    status = "failed";
    errorMsg = err.message || String(err);
    console.error(`[mailer] send failed (${type} -> ${to}):`, errorMsg);
  }

  // Persist to email_logs so the frontend can list it
  let logId = null;
  try {
    const [r] = await pool.query(
      `INSERT INTO email_logs
        (recipient_email, recipient_name, subject, body, type, related_id, related_type,
         triggered_by_user_id, message_id, preview_url, status, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        to,
        toName || null,
        subject,
        html || text || "",
        type || "generic",
        relatedId || null,
        relatedType || null,
        triggeredByUserId || null,
        messageId,
        previewUrl,
        status,
        errorMsg,
      ]
    );
    logId = r.insertId;
  } catch (err) {
    console.error("[mailer] failed to write email_logs row:", err.message);
  }

  return { ok: status === "sent", messageId, previewUrl, error: errorMsg, logId };
}

module.exports = { sendEmail, getTransporter };
