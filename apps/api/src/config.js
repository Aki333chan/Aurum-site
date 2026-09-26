import 'dotenv/config';

export function readConfig(env = process.env) {
  const required = (key) => {
    const value = env[key];
    if (!value) throw new Error(`Missing ${key}`);
    return value;
  };

  const publicUrl = new URL(required('BETTER_AUTH_URL'));
  if (publicUrl.protocol !== 'https:' && !(publicUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(publicUrl.hostname))) {
    throw new Error('BETTER_AUTH_URL must use HTTPS outside localhost');
  }
  if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) throw new Error('BETTER_AUTH_URL must be an origin');

  const secret = required('BETTER_AUTH_SECRET');
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must have at least 32 characters');

  const flag = (key) => {
    const value = required(key);
    if (value !== 'true' && value !== 'false') throw new Error(`${key} must be true or false`);
    return value === 'true';
  };
  const emailEnabled = flag('EMAIL_ENABLED');
  const registrationEnabled = flag('REGISTRATION_ENABLED');
  if (registrationEnabled && !emailEnabled) throw new Error('Registration requires email delivery');

  const smtpPort = emailEnabled ? Number(required('SMTP_PORT')) : 0;
  const port = Number(env.PORT || 3007);
  if ((emailEnabled && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');

  return {
    publicUrl: publicUrl.origin,
    secret,
    databaseUrl: required('DATABASE_URL'),
    emailEnabled,
    registrationEnabled,
    smtpHost: emailEnabled ? required('SMTP_HOST') : '',
    smtpPort,
    smtpUser: emailEnabled ? required('SMTP_USER') : '',
    smtpPassword: emailEnabled ? required('SMTP_PASSWORD') : '',
    smtpFrom: emailEnabled ? required('SMTP_FROM') : '',
    port,
  };
}
