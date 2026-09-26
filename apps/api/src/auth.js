import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { username } from 'better-auth/plugins';
import { Pool } from 'pg';
import { readConfig } from './config.js';
import { createMailer } from './email.js';

const config = readConfig();
const sendMail = config.emailEnabled ? createMailer(config) : null;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 4,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

const sendSafely = (to, subject, text) => {
  if (!sendMail) throw new Error('Email delivery is disabled');
  void sendMail(to, subject, text).catch((error) => console.error('Email delivery failed:', error.message));
};
const reservedNames = new Set(['admin', 'administrator', 'aurum', 'gm', 'mod', 'moderator', 'owner', 'staff', 'support', 'system']);

export const createAuth = ({ bootstrap = false } = {}) => betterAuth({
  appName: 'Aurum Site',
  baseURL: config.publicUrl,
  secret: config.secret,
  trustedOrigins: [config.publicUrl],
  database: pool,
  advanced: { ipAddress: { ipAddressHeaders: ['x-real-ip'] } },
  rateLimit: { enabled: true, window: 60, max: 60 },
  hooks: { before: createAuthMiddleware(async (context) => {
    if (context.path !== '/sign-up/email') return;
    const nickname = context.body?.username;
    if (typeof nickname !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(nickname) || reservedNames.has(nickname.toLowerCase())) {
      throw new APIError('BAD_REQUEST', { message: 'Choose a valid nickname' });
    }
  }) },
  plugins: [username({
    minUsernameLength: 3,
    maxUsernameLength: 20,
    usernameValidator: (value) => /^[A-Za-z0-9_]+$/.test(value) && !reservedNames.has(value.toLowerCase()),
  })],
  emailAndPassword: {
    enabled: true,
    disableSignUp: !config.registrationEnabled && !bootstrap,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 15,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    ...(config.emailEnabled ? { sendResetPassword: ({ user, url }) => sendSafely(user.email, 'Aurum — сброс пароля', `Если ты запросил сброс пароля, открой ссылку:\n${url}\n\nЕсли это был не ты, просто проигнорируй письмо.`) } : {}),
  },
  emailVerification: {
    sendOnSignUp: config.emailEnabled,
    sendOnSignIn: config.emailEnabled,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendVerificationEmail: ({ user, url }) => sendSafely(user.email, 'Aurum — подтверждение email', `Подтверди адрес для завершения регистрации:\n${url}\n\nСсылка действует один час. Если ты не регистрировался, проигнорируй письмо.`),
  },
});

export const auth = createAuth();
