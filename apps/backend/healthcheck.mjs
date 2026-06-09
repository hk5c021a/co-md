// Docker HEALTHCHECK — uses Node.js built-in http (no wget dependency).
import http from 'node:http';

const port = process.env.PORT || 3000;

const req = http.get(`http://localhost:${port}/health`, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.setTimeout(2_000, () => { req.destroy(); process.exit(1); });
