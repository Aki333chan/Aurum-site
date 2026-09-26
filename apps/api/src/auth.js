import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { username } from 'better-auth/plugins';
import { readConfig } from './config.js';
import { createMailer } from './email.js';
import { getSiteSettings, isSiteAdmin, pool } from './site-data.js';

const config = readConfig();
export { pool };

const sendSafely = (to, subject, text) => {
  void getSiteSettings().then((settings) => {
    if (!settings.emailEnabled) throw new Error('Email delivery is disabled');
    return createMailer(settings)(to, subject, text);
  }).catch((error) => console.error('Email delivery failed:', error.message));
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
    if (context.path === '/sign-in/email' || context.path === '/sign-in/username') {
      const settings = await getSiteSettings();
      if (settings.maintenanceEnabled) {
        const name = context.path === '/sign-in/email' ? context.body?.email : context.body?.username;
        const result = await pool.query(`SELECT a.user_id FROM site_admin a JOIN "user" u ON u.id = a.user_id
          WHERE lower(${context.path === '/sign-in/email' ? 'u.email' : 'u.username'}) = lower($1)`, [typeof name === 'string' ? name : '']);
        if (result.rowCount !== 1 || !await isSiteAdmin(result.rows[0].user_id)) {
          throw new APIError('SERVICE_UNAVAILABLE', { message: 'Site maintenance' });
        }
      }
      return;
    }
    if (context.path !== '/sign-up/email') return;
    const settings = await getSiteSettings();
    if (!bootstrap && (!settings.registrationEnabled || settings.maintenanceEnabled || !settings.emailEnabled)) {
      throw new APIError('SERVICE_UNAVAILABLE', { message: 'Registration is unavailable' });
    }
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
    disableSignUp: false,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 15,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) => sendSafely(user.email, 'Aurum — сброс пароля', `Если ты запросил сброс пароля, открой ссылку:\n${url}\n\nЕсли это был не ты, просто проигнорируй письмо.`),
  },
  emailVerification: {
    sendOnSignUp: !bootstrap,
    sendOnSignIn: !bootstrap,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendVerificationEmail: ({ user, url }) => sendSafely(user.email, 'Aurum — подтверждение email', `Подтверди адрес для завершения регистрации:\n${url}\n\nСсылка действует один час. Если ты не регистрировался, проигнорируй письмо.`),
  },
});

export const auth = createAuth();
