import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const path = '/etc/aurum-site/api.env';
const secret = randomBytes(48).toString('base64url');
const settings = [
  'BETTER_AUTH_URL=https://aurumgg.ovh',
  `BETTER_AUTH_SECRET=${secret}`,
  'DATABASE_URL=postgresql:///aurum_site?host=/var/run/postgresql',
  'EMAIL_ENABLED=false',
  'REGISTRATION_ENABLED=false',
  'PORT=3007',
  '',
].join('\n');

writeFileSync(path, settings, { flag: 'wx', mode: 0o640 });
console.log(`${path} created without SMTP; registration remains closed.`);
