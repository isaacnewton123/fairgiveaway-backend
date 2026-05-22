import { Elysia, t } from 'elysia';
import { Giveaway, redis } from '../db';

export function drawRoutes() {
  return new Elysia()
    .post(
      '/api/draw/search',
      async ({ body }) => {
        const { drawId } = body;

        // Check permanent storage first
        const doc = await Giveaway.findById(drawId);
        if (doc) {
          return { found: true, platform: doc.platform };
        }

        // Fall back to ephemeral Redis session
        const cached = await redis.get(`draw:${drawId}`);
        if (cached) {
          return { found: true, platform: 'X' };
        }

        return { found: false };
      },
      {
        body: t.Object({ drawId: t.String() }),
      }
    );
}
