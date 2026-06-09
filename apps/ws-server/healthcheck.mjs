// Docker HEALTHCHECK — uses Node.js built-in http (no wget dependency).
import http from 'node:http';

const port = process.env.WS_PORT || process.env.PORT || 4000;

const req = http.get(`http://localhost:${port}/health`, (res) => {
  // Only treat 200 as healthy. 503 means Redis is unavailable (degraded state).
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.setTimeout(2_000, () => { req.destroy(); process.exit(1); });
