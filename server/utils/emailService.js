/**
 * Gmail SMTP Email Service via Nodemailer
 * Handles email verification delivery for Orbit using authenticated Gmail SMTP.
 */

const nodemailer = require("nodemailer");

// In-memory store for unit tests when running in test mode without live SMTP calls
const _sentEmails = [];

/**
 * Creates a configured Nodemailer transporter using Gmail SMTP.
 * @returns {nodemailer.Transporter}
 */
function createTransporter() {
  const user = (process.env.GMAIL_USER || "").trim();
  const rawPass = process.env.GMAIL_APP_PASSWORD || "";
  const pass = rawPass.replace(/\s+/g, "").trim();

  if (!user || !pass) {
    const missing = [];
    if (!user) missing.push("GMAIL_USER");
    if (!pass) missing.push("GMAIL_APP_PASSWORD");
    throw new Error(`Gmail SMTP credentials are not configured. Missing: ${missing.join(", ")} in server/.env.`);
  }

  const host = process.env.GMAIL_SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.GMAIL_SMTP_PORT || "465", 10);
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Sends a 6-digit email verification code to a user via Gmail SMTP.
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.username - Recipient username
 * @param {string} [options.code] - 6-digit verification code
 * @param {string} [options.token] - Legacy token fallback
 * @returns {Promise<{ success: boolean, messageId?: string }>}
 */
async function sendVerificationEmail({ to, username, code, token }) {
  const verificationCode = code || token;
  if (!to || !verificationCode) {
    throw new Error("Recipient email and verification code are required");
  }

  const gmailUser = process.env.GMAIL_USER;
  const senderName = process.env.GMAIL_SENDER_NAME || "Orbit";
  const fromAddress = gmailUser ? `"${senderName}" <${gmailUser}>` : `"Orbit" <noreply@gmail.com>`;

  // Test mode handling: Mock email sending in automated tests; do not send real emails
  if (process.env.NODE_ENV === "test") {
    if (gmailUser === "simulate_failure") {
      throw new Error("Email delivery failed: Simulated Gmail SMTP transmission failure");
    }

    if (!gmailUser || gmailUser.startsWith("test_") || gmailUser.startsWith("mock_")) {
      _sentEmails.push({
        to,
        username,
        from: fromAddress,
        timestamp: new Date(),
        // For test assertions only; never logged or exposed in production
        _code: verificationCode,
        _token: verificationCode,
      });
      return { success: true, messageId: `<mock-nodemailer-${Date.now()}@gmail.com>` };
    }
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Orbit verification code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px; color: #111827; }
    .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .logo { color: #6c63e8; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 20px; }
    .title { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #111827; }
    .text { font-size: 15px; line-height: 1.6; color: #4b5563; margin-bottom: 16px; }
    .code-box { background-color: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 18px 24px; margin: 24px 0; text-align: center; letter-spacing: 10px; font-size: 34px; font-weight: 800; color: #6c63e8; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
    .notice { font-size: 13px; line-height: 1.5; color: #64748b; margin-top: 16px; }
    .footer { margin-top: 28px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Orbit</div>
    <div class="title">Verify your email address</div>
    <p class="text">Hello ${escapeHtml(username || "there")},</p>
    <p class="text">Thank you for joining Orbit. Enter the following 6-digit verification code in Orbit to activate your account:</p>
    <div class="code-box">${escapeHtml(verificationCode)}</div>
    <p class="notice">This code is valid for <strong>10 minutes</strong> and can only be used once. Do not share this code with anyone.</p>
    <div class="footer">
      If you did not create an Orbit account, please ignore this email.
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `
Hello ${username || "there"},

Your Orbit verification code is: ${verificationCode}

Enter this 6-digit code in the Orbit app to activate your account. This code is valid for 10 minutes.

If you did not create an Orbit account, please ignore this email.
  `.trim();

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject: "Your Orbit verification code",
      html: htmlContent,
      text: textContent,
    });

    console.log(`[EmailService] Verification code sent successfully to ${maskEmail(to)}. MessageId: ${info?.messageId || "delivered"}`);
    return { success: true, messageId: info?.messageId };
    return { success: true, messageId: info?.messageId };
  } catch (err) {
    const diagnostic = {
      code: err.code || "UNKNOWN_ERROR_CODE",
      responseCode: err.responseCode || null,
      command: err.command || null,
      message: sanitizeErrorMessage(err.message),
    };

    console.error(`[EmailService] Failed to send verification email to ${maskEmail(to)}:`, JSON.stringify(diagnostic));

    let hint = "";
    if (err.code === "EAUTH" || err.responseCode === 535) {
      hint = "Authentication failed (EAUTH 535). Please verify GMAIL_USER is your full Gmail address, GMAIL_APP_PASSWORD is a valid 16-character Google App Password (not your normal Google account password), and that 2-Step Verification is active on your Google account.";
    } else if (err.code === "ESOCKET" || err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") {
      hint = "Network connection failed. Gmail SMTP port 465 or 587 may be blocked by your network/firewall/ISP.";
    } else if (err.code === "EENVELOPE" || err.responseCode === 550 || err.responseCode === 553) {
      hint = "Recipient or sender address was rejected by Gmail SMTP.";
    }

    if (hint) {
      console.error(`[EmailService] Diagnostic hint: ${hint}`);
    }

    if (err.message && err.message.startsWith("Email delivery failed")) {
      throw err;
    }
    throw new Error(`Email delivery failed: ${diagnostic.message}${hint ? ` - ${hint}` : ""}`);
  }
}

function maskEmail(email) {
  if (!email || typeof email !== "string") return "unknown";
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-2)}@${domain}`;
}

function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== "string") return "Unknown error";
  return msg
    .replace(/token=[a-zA-Z0-9_\-]+/gi, "token=[REDACTED]")
    .replace(/password=[^\s&]+/gi, "password=[REDACTED]")
    .replace(/pass=[^\s&]+/gi, "pass=[REDACTED]");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function _getSentEmails() {
  return _sentEmails;
}

function _clearSentEmails() {
  _sentEmails.length = 0;
}

module.exports = {
  sendVerificationEmail,
  createTransporter,
  maskEmail,
  sanitizeErrorMessage,
  _getSentEmails,
  _clearSentEmails,
};
