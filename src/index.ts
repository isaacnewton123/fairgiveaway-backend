import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { connectDB } from './db';
import { drawRoutes } from './routes/draw';
import { xRoutes, xScrapeRoutes } from './routes/x';

const PORT = 7860;

async function main(): Promise<void> {
  await connectDB();

  const app = new Elysia()
    .use(cors({ origin: true, credentials: true }))
    .use(
      swagger({
        provider: 'scalar',
        path: '/docs',
        documentation: {
          info: { title: 'FairGiveaway API', version: '1.0.0' },
        },
      })
    )
    .use(xRoutes()) // Move regular routes outside the rate limit guard
    .use(xScrapeRoutes())
    .use(drawRoutes())
    .get('/api/health-check-xyz-9912', () => 'OK')
    .get('/', () => ({
      name: 'FairGiveaway API',
      version: '1.0.0',
      docs: '/docs',
    }))
    .listen({ port: PORT, hostname: '0.0.0.0' });

  console.log(`🎲 FairGiveaway API running at http://localhost:${app.server?.port}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
