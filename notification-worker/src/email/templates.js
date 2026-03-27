'use strict';

/**
 * Generates email content for a placed order.
 *
 * @param {object} params
 * @param {string} params.name      - Customer display name
 * @param {string} params.orderId   - Order identifier
 * @param {number} params.total     - Order total amount
 * @returns {{ subject: string, html: string, text: string }}
 */
function orderPlacedTemplate({ name, orderId, total }) {
  const formattedTotal = Number(total).toFixed(2);
  const subject = `Order Confirmed — #${orderId}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#2563eb;padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Order Confirmed</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi <strong>${escapeHtml(name)}</strong>,</p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 24px;">
                Thank you for your order! We have received your request and are getting it ready.
              </p>
              <!-- Order Summary Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px;">Order Summary</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#374151;font-size:14px;padding:4px 0;">Order ID</td>
                        <td style="color:#111827;font-size:14px;font-weight:600;text-align:right;padding:4px 0;">#${escapeHtml(orderId)}</td>
                      </tr>
                      <tr>
                        <td style="color:#374151;font-size:14px;padding:4px 0;">Order Total</td>
                        <td style="color:#2563eb;font-size:18px;font-weight:700;text-align:right;padding:4px 0;">$${formattedTotal}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">
                You will receive another email once your order has been shipped.
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0;">
                Questions? Reply to this email — we're happy to help.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                You received this email because you placed an order. &copy; ${new Date().getFullYear()} Example Inc.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${name},

Order Confirmed — #${orderId}

Thank you for your order! Here is your summary:

  Order ID:    #${orderId}
  Order Total: $${formattedTotal}

You will receive another email once your order has been shipped.

Questions? Reply to this email.

© ${new Date().getFullYear()} Example Inc.`;

  return { subject, html, text };
}

/**
 * Generates email content for a password reset request.
 *
 * @param {object} params
 * @param {string} params.name       - User display name
 * @param {string} params.resetLink  - Full reset URL (token already embedded)
 * @returns {{ subject: string, html: string, text: string }}
 */
function passwordResetTemplate({ name, resetLink }) {
  const subject = 'Reset Your Password';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#dc2626;padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Password Reset</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi <strong>${escapeHtml(name)}</strong>,</p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 24px;">
                We received a request to reset the password for your account.
                Click the button below to choose a new password.
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" target="_blank"
                       style="display:inline-block;background-color:#dc2626;color:#ffffff;font-size:16px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Warning Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="color:#b91c1c;font-size:14px;margin:0;">
                      <strong>Security notice:</strong> This link expires in 1 hour.
                      If you did not request a password reset, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0;">
                If the button above does not work, copy and paste the following URL into your browser:<br />
                <span style="color:#2563eb;word-break:break-all;">${escapeHtml(resetLink)}</span>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                You received this email because a password reset was requested for your account. &copy; ${new Date().getFullYear()} Example Inc.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${name},

Password Reset Request

We received a request to reset the password for your account.
Please visit the link below to choose a new password:

${resetLink}

This link expires in 1 hour.

If you did not request a password reset, you can safely ignore this email.

© ${new Date().getFullYear()} Example Inc.`;

  return { subject, html, text };
}

/**
 * Minimal HTML entity escaping to prevent injection in email templates.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

module.exports = { orderPlacedTemplate, passwordResetTemplate };
