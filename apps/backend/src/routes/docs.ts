import { Hono } from 'hono';
import { openapiSpecification } from '../openapi.js';

const app = new Hono();

/**
 * @openapi
 * /api-docs:
 *   get:
 *     summary: Get OpenAPI specification
 *     responses:
 *       200:
 *         description: OpenAPI specification JSON
 */
app.get('/', (c) => c.json(openapiSpecification));

export default app;
