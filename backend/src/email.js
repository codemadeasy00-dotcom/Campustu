const nodemailer = require('nodemailer');
const config = require('./config');

const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

async function sendOtpEmail(to, code) {
  if (!transport) {
    // Development only (production refuses to start without SMTP, see config.js).
    console.log(`\n[DEV EMAIL] OTP for ${to}: ${code}\n`);
    return;
  }
  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject: 'Your CampusKit verification code',
    text:
      `Your CampusKit code is ${code}.\n` +
      `It expires in ${config.otp.ttlMinutes} minutes. If you did not request it, ignore this email.`,
  });
}

module.exports = { sendOtpEmail };
