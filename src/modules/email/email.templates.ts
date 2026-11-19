export type OtpEmailPurpose =
  'customer_registration' | 'customer_reset_pin' | 'admin_initial_pin' | 'admin_reset_pin';

interface PurposeDetails {
  subject: string;
  headline: string;
  description: string;
}

const PURPOSE_DETAILS: Record<OtpEmailPurpose, PurposeDetails> = {
  customer_registration: {
    subject: 'Your Verification Code — Green Marketplace',
    headline: 'Welcome to Green Marketplace',
    description:
      'Use the verification code below to verify your email address and complete your registration.',
  },
  customer_reset_pin: {
    subject: 'Reset Your MPIN — Green Marketplace',
    headline: 'Reset Customer MPIN',
    description: 'We received a request to reset your 6-digit MPIN. Use the code below to proceed.',
  },
  admin_initial_pin: {
    subject: 'Admin MPIN Setup — Green Marketplace',
    headline: 'Initial Admin MPIN Setup',
    description:
      'Use the verification code below to set up your 6-digit MPIN for your administrator account.',
  },
  admin_reset_pin: {
    subject: 'Admin MPIN Reset — Green Marketplace',
    headline: 'Reset Administrator MPIN',
    description:
      'We received a request to reset your administrator MPIN. Use the code below to proceed.',
  },
};

export function renderOtpEmail(
  purpose: OtpEmailPurpose,
  otp: string,
  expiryMinutes: number,
): { subject: string; html: string; text: string } {
  const details = PURPOSE_DETAILS[purpose];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${details.subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px; color: #1f2937; }
    .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .header { background: #166534; padding: 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; }
    .content { padding: 32px 24px; text-align: center; }
    .headline { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111827; }
    .description { font-size: 14px; line-height: 1.5; color: #4b5563; margin-bottom: 24px; }
    .otp-box { display: inline-block; background: #ecfdf5; border: 2px dashed #059669; border-radius: 8px; padding: 14px 28px; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #065f46; margin: 8px 0 24px; }
    .meta { font-size: 13px; color: #6b7280; margin-bottom: 16px; }
    .security-notice { font-size: 12px; color: #9ca3af; line-height: 1.4; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 16px; }
    .footer { text-align: center; font-size: 11px; color: #9ca3af; padding: 16px 24px; background: #f9fafb; border-top: 1px solid #f3f4f6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Green Marketplace</h1>
    </div>
    <div class="content">
      <div class="headline">${details.headline}</div>
      <div class="description">${details.description}</div>
      <div class="otp-box">${otp}</div>
      <div class="meta">This code will expire in <strong>${expiryMinutes} minutes</strong>.</div>
      <div class="security-notice">
        If you did not request this verification code, please ignore this email.
        Never share your code with anyone — Green Marketplace staff will never ask for it.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Green Marketplace. All rights reserved.
    </div>
  </div>
</body>
</html>`;

  const text = `${details.headline}

${details.description}

Your 6-digit verification code: ${otp}

This code will expire in ${expiryMinutes} minutes.

If you did not request this code, please ignore this email. Never share your OTP with anyone.`;

  return {
    subject: details.subject,
    html,
    text,
  };
}
