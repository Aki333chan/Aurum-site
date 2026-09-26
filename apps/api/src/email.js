import nodemailer from 'nodemailer';

export function createMailer(config) {
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    requireTLS: config.smtpPort !== 465,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });

  return async (to, subject, text) => {
    await transport.sendMail({ from: config.smtpFrom, to, subject, text });
  };
}
