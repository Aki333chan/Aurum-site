import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.BETTER_AUTH_URL = 'https://aurumgg.ovh';
process.env.BETTER_AUTH_SECRET = 'unit-test-secret-with-more-than-32-characters';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:5432/unused';
process.env.EMAIL_ENABLED = 'false';
process.env.REGISTRATION_ENABLED = 'false';

const { encryptSecret, decryptSecret, pool } = await import('../src/site-data.js');
after(() => pool.end());

test('SMTP password is encrypted and tampering is rejected', () => {
  const encrypted = encryptSecret('example-password');
  assert.notEqual(encrypted, 'example-password');
  assert.equal(decryptSecret(encrypted), 'example-password');
  assert.throws(() => decryptSecret(`${encrypted.slice(0, -4)}AAAA`));
  assert.equal(decryptSecret(null), '');
});
