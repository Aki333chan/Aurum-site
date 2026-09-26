import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { readConfig } from './config.js';
import { createMailer } from './email.js';

const config = readConfig();
const sendMail = createMailer(config);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 4,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

const sendSafely = (to, subject, text) => {
  void sendMail(to, subject, text).catch((error) => console.error('Email delivery failed:', error.message));
};

export const auth = betterAuth({
  appName: 'Aurum Site',
  baseURL: config.publicUrl,
  secret: config.secret,
  trustedOrigins: [config.publicUrl],
  database: pool,
  advanced: { ipAddress: { ipAddressHeaders: ['x-real-ip'] } },
  rateLimit: { enabled: true, window: 60, max: 60 },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 15,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) => sendSafely(user.email, 'Aurum — сброс пароля', `Если ты запросил сброс пароля, открой ссылку:\n${url}\n\nЕсли это был не ты, просто проигнорируй письмо.`),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendVerificationEmail: ({ user, url }) => sendSafely(user.email, 'Aurum — подтверждение email', `Подтверди адрес для завершения регистрации:\n${url}\n\nСсылка действует один час. Если ты не регистрировался, проигнорируй письмо.`),
  },
});
