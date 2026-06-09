import { Hono } from 'hono';
import { register } from '../middleware/metrics.js';

const app = new Hono();

app.get('/metrics', async (c) => {
  c.header('Content-Type', register.contentType);
  const metrics = await register.metrics();
  return c.body(metrics);
});

export default app;
