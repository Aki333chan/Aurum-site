import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.BETTER_AUTH_URL = 'https://aurumgg.ovh';
process.env.BETTER_AUTH_SECRET = 'unit-test-secret-with-more-than-32-characters';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:5432/unused';
process.env.EMAIL_ENABLED = 'false';
process.env.REGISTRATION_ENABLED = 'false';

const { encryptSecret, decryptSecret, normalizeProfileInput, pool } = await import('../src/site-data.js');
after(() => pool.end());

test('SMTP password is encrypted and tampering is rejected', () => {
  const encrypted = encryptSecret('example-password');
  assert.notEqual(encrypted, 'example-password');
  assert.equal(decryptSecret(encrypted), 'example-password');
  assert.throws(() => decryptSecret(`${encrypted.slice(0, -4)}AAAA`));
  assert.equal(decryptSecret(null), '');
});

test('profile input accepts plain text but rejects control characters and oversized fields', () => {
  assert.deepEqual(normalizeProfileInput({ tagline: '  Город  у  моря  ', about: 'Строю\nиграю' }),
    { tagline: 'Город у моря', about: 'Строю\nиграю' });
  assert.throws(() => normalizeProfileInput({ tagline: 'a'.repeat(121), about: '' }));
  assert.throws(() => normalizeProfileInput({ tagline: '', about: 'a'.repeat(601) }));
  assert.throws(() => normalizeProfileInput({ tagline: '', about: 'text\u202e' }));
  assert.throws(() => normalizeProfileInput({ tagline: '', about: '\u0000' }));
  assert.throws(() => normalizeProfileInput({ tagline: '', about: 42 }));
});
