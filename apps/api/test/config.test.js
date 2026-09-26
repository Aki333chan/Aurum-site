import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config.js';

const valid = {
  BETTER_AUTH_URL: 'https://aurumgg.ovh',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  DATABASE_URL: 'postgresql://user:pass@localhost/site',
  EMAIL_ENABLED: 'true',
  REGISTRATION_ENABLED: 'true',
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'mailer',
  SMTP_PASSWORD: 'secret',
  SMTP_FROM: 'Aurum <mailer@example.com>',
};

test('auth config rejects missing secrets and insecure public origins', () => {
  assert.throws(() => readConfig({ ...valid, BETTER_AUTH_SECRET: '' }), /BETTER_AUTH_SECRET/);
  assert.throws(() => readConfig({ ...valid, BETTER_AUTH_URL: 'http://aurumgg.ovh' }), /HTTPS/);
  assert.equal(readConfig(valid).publicUrl, 'https://aurumgg.ovh');
});

test('registration cannot open without mail, but verified accounts can sign in before SMTP', () => {
  assert.throws(() => readConfig({ ...valid, EMAIL_ENABLED: 'false' }), /Registration requires email delivery/);
  const beforeMail = readConfig({ ...valid, EMAIL_ENABLED: 'false', REGISTRATION_ENABLED: 'false', SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM: '' });
  assert.equal(beforeMail.registrationEnabled, false);
  assert.equal(beforeMail.emailEnabled, false);
  assert.throws(() => readConfig({ ...valid, REGISTRATION_ENABLED: 'yes' }), /REGISTRATION_ENABLED/);
});
