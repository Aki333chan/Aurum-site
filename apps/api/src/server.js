import { createServer } from 'node:http';
import { toNodeHandler } from 'better-auth/node';
import { auth, pool } from './auth.js';
import { readConfig } from './config.js';

const config = readConfig();
const handleAuth = toNodeHandler(auth);

const server = createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  if (path.startsWith('/api/auth/')) {
    try {
      await handleAuth(req, res);
    } catch (error) {
      console.error('Auth request failed:', error.message);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(503).end(JSON.stringify({ error: 'Authentication service unavailable' }));
      } else res.destroy();
    }
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (path === '/api/health/ready' && req.method === 'GET') {
    try {
      await pool.query('SELECT 1');
      res.writeHead(200).end(JSON.stringify({ ready: true }));
    } catch {
      res.writeHead(503).end(JSON.stringify({ ready: false }));
    }
    return;
  }
  res.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
});

try {
  await pool.query('SELECT 1');
  server.listen(config.port, '127.0.0.1', () => console.log(`Aurum Site API listening on 127.0.0.1:${config.port}`));
} catch (error) {
  console.error('Aurum Site database unavailable:', error.message);
  await pool.end();
  process.exitCode = 1;
}
