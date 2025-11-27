import logger from "../lib/logger";

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send email using configured provider
 * TODO: Integrate with actual email service (SendGrid, SES, Nodemailer, etc.)
 *
 * For development, this logs the email content instead of sending.
 * Set EMAIL_ENABLED=true and configure SMTP settings to enable actual sending.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const emailEnabled = process.env.EMAIL_ENABLED === "true";

  // For development or when email is disabled, log the email content
  if (!emailEnabled) {
    logger.info("📧 Email would be sent (EMAIL_ENABLED is not true):", {
      to: options.to,
      subject: options.subject,
      text:
        options.text.substring(0, 300) +
        (options.text.length > 300 ? "..." : ""),
    });
    return true;
  }

  // TODO: Implement actual email sending when EMAIL_ENABLED=true
  // Example with Nodemailer:
  // import nodemailer from 'nodemailer'
  // const transporter = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST,
  //   port: Number(process.env.SMTP_PORT) || 587,
  //   secure: process.env.SMTP_SECURE === 'true',
  //   auth: {
  //     user: process.env.SMTP_USER,
  //     pass: process.env.SMTP_PASS,
  //   },
  // })
  // await transporter.sendMail({
  //   from: process.env.EMAIL_FROM || 'noreply@example.com',
  //   ...options,
  // })

  logger.warn("Email service not fully configured for production", {
    to: options.to,
    subject: options.subject,
  });
  return true;
}

/**
 * Send password reset email
 * Note: For local systems, the frontend URL should be determined at request time via getFrontendBaseUrl()
 * This fallback is for situations where no request context is available.
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  username: string,
  frontendBaseUrl?: string
): Promise<boolean> {
  const frontendUrl =
    frontendBaseUrl || process.env.FRONTEND_URL || "http://localhost:5173";
  const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

  return sendEmail({
    to: email,
    subject: "Password Reset Request",
    text: `
Hello ${username},

You requested a password reset. Click the link below to reset your password:

${resetUrl}

This link will expire in 30 minutes.

If you did not request this, please ignore this email.

Best regards,
UNV AI Report Server
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Password Reset Request</h2>
    <p>Hello ${username},</p>
    <p>You requested a password reset. Click the button below to reset your password:</p>
    <p style="margin: 30px 0;">
      <a href="${resetUrl}" class="button">Reset Password</a>
    </p>
    <p>Or copy this link:</p>
    <p><code>${resetUrl}</code></p>
    <p><small>This link will expire in 30 minutes.</small></p>
    <p>If you did not request this, please ignore this email.</p>
    <div class="footer">
      <p>Best regards,<br>UNV AI Report Server</p>
    </div>
  </div>
</body>
</html>
    `,
  });
}

/**
 * Send account deactivation notification
 */
export async function sendAccountDeactivatedEmail(
  email: string,
  username: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Account Deactivated",
    text: `
Hello ${username},

Your account has been deactivated by an administrator.

If you believe this is an error, please contact your system administrator.

Best regards,
UNV AI Report Server
    `.trim(),
  });
}

/**
 * Send password changed notification
 */
export async function sendPasswordChangedEmail(
  email: string,
  username: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Password Changed",
    text: `
Hello ${username},

Your password has been successfully changed.

If you did not make this change, please contact your system administrator immediately.

Best regards,
UNV AI Report Server
    `.trim(),
  });
}
