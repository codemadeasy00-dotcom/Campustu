const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: Number(process.env.SMTP_PORT) || 2525, // Port 2525 bypasses cloud firewall blocks
  secure: false,
  connectionTimeout: 10000, // 10s timeout so the server doesn't freeze
  greetingTimeout: 10000,
  socketTimeout: 10000,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendOtpEmail(toEmail, code) {
  // If SMTP credentials aren't set on Render, fallback to logging the code
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[DEV OTP FALLBACK] Code for ${toEmail}: ${code}`);
    return;
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || 'Campustu <no-reply@campustu.app>',
    to: toEmail,
    subject: 'Your Campustu Verification Code',
    text: `Your 6-digit login/signup code for Campustu is: ${code}. It expires in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 600px; margin: auto; background: #f9fafb; border-radius: 8px;">
        <h2 style="color: #0f766e; margin-bottom: 8px;">Campustu Verification</h2>
        <p style="color: #374151; font-size: 16px;">Here is your 6-digit code to securely log in or sign up:</p>
        <div style="background: #ffffff; padding: 16px; text-align: center; border-radius: 6px; border: 1px solid #e5e7eb; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111827;">${code}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendOtpEmail };