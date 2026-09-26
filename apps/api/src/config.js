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

  const smtpPort = Number(required('SMTP_PORT'));
  const port = Number(env.PORT || 3007);
  if (![smtpPort, port].every((value) => Number.isInteger(value) && value > 0 && value < 65536)) throw new Error('Invalid port');

  return {
    publicUrl: publicUrl.origin,
    secret,
    databaseUrl: required('DATABASE_URL'),
    smtpHost: required('SMTP_HOST'),
    smtpPort,
    smtpUser: required('SMTP_USER'),
    smtpPassword: required('SMTP_PASSWORD'),
    smtpFrom: required('SMTP_FROM'),
    port,
  };
}
