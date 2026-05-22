import { Elysia, t } from 'elysia';

import { Giveaway, redis } from '../db';
import { scrapeTweet, verifyCandidate } from '../scraper';

const REDIS_TTL = 900; // 15-minute session window

// ── Helpers ──────────────────────────────────────────────

async function storeDrawSession(
  drawId: string,
  tweetId: string,
  mode: string,
  participants: string[],
  hostUsername: string,
  hostAvatarUrl?: string
): Promise<void> {
  const tasks = [
    redis.set(`draw:${drawId}`, JSON.stringify(participants), { ex: REDIS_TTL }),
    redis.set(`draw:${drawId}:mode`, mode, { ex: REDIS_TTL }),
    redis.set(`draw:${drawId}:tweetId`, tweetId, { ex: REDIS_TTL }),
    redis.set(`draw:${drawId}:hostUsername`, hostUsername, { ex: REDIS_TTL }),
  ];
  if (hostAvatarUrl) {
    tasks.push(redis.set(`draw:${drawId}:hostAvatarUrl`, hostAvatarUrl, { ex: REDIS_TTL }));
  }
  await Promise.all(tasks);
}

async function clearDrawSession(drawId: string): Promise<void> {
  await Promise.all([
    redis.del(`draw:${drawId}`),
    redis.del(`draw:${drawId}:mode`),
    redis.del(`draw:${drawId}:tweetId`),
    redis.del(`draw:${drawId}:hostUsername`),
    redis.del(`draw:${drawId}:hostAvatarUrl`),
  ]);
}

async function loadActiveSession(id: string) {
  const [raw, mode, tweetId, hostUsername, hostAvatarUrl] = await Promise.all([
    redis.get(`draw:${id}`),
    redis.get(`draw:${id}:mode`),
    redis.get(`draw:${id}:tweetId`),
    redis.get(`draw:${id}:hostUsername`),
    redis.get(`draw:${id}:hostAvatarUrl`),
  ]);
  if (!raw) return null;

  const participants = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { participants, mode, tweetId, hostUsername, hostAvatarUrl, drawId: id };
}

// ── Handlers ─────────────────────────────────────────────

async function handleInitDraw({
  body,
  set,
}: {
  body: { tweetId: string; mode: string; hostUsername?: string };
  set: { status?: number | string };
}) {
  const { tweetId, mode, hostUsername: clientHost } = body;
  const { participants, hostUsername: scrapedHost, hostAvatarUrl: scrapedHostAvatar } = await scrapeTweet(tweetId, mode as 'likes' | 'reposts');

  if (participants.length === 0) {
    set.status = 404;
    return { error: 'No eligible participants found or failed to scrape.' };
  }

  const finalHost = (scrapedHost && scrapedHost !== 'unknown') ? scrapedHost : (clientHost || 'unknown');

  const drawId = crypto.randomUUID();
  const hostAvatarUrl = scrapedHostAvatar || (finalHost !== 'unknown' ? `https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png` : undefined);

  await storeDrawSession(drawId, tweetId, mode, participants, finalHost, hostAvatarUrl);

  return {
    drawId,
    tweetId,
    mode,
    hostUsername: finalHost,
    hostAvatarUrl,
    participants,
    totalParticipants: participants.length,
    status: 'active',
    winners: [],
    createdAt: Date.now(),
  };
}

async function handleDrawStatus({ params, set }: { params: { id: string }; set: { status?: number | string } }) {
  const { id } = params;

  const doc = await Giveaway.findById(id);
  if (doc) {
    return { status: 'finalized', data: doc };
  }

  const session = await loadActiveSession(id);
  if (session) {
    return { status: 'active', ...session };
  }

  set.status = 404;
  return { error: 'Draw not found or expired' };
}

async function handleSaveDraw({ body }: { body: { drawId: string; tweetId: string; hostUsername: string; hostAvatarUrl?: string; mode: string; totalParticipants: number; participants?: string[]; enabledFeatures?: string[]; engagementTasks?: Record<string, unknown>; antiBotFilters?: Record<string, unknown>; winners: Record<string, string>[] } }) {
  const { drawId, tweetId, hostUsername, hostAvatarUrl, mode, totalParticipants, participants, enabledFeatures, engagementTasks, antiBotFilters, winners } = body;

  const giveaway = new Giveaway({
    _id: drawId,
    tweetId,
    hostUsername,
    hostAvatarUrl,
    mode,
    totalParticipants,
    participants: participants || [],
    enabledFeatures: enabledFeatures || [],
    engagementTasks,
    antiBotFilters,
    winners,
  });
  await giveaway.save();
  await clearDrawSession(drawId);

  return { success: true };
}

async function handleHistory() {
  return await Giveaway.find({ platform: 'X' })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
}

async function handleTweetHistory({ params }: { params: { tweetId: string } }) {
  return await Giveaway.find({ platform: 'X', tweetId: params.tweetId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
}

async function handleLeaderboard() {
  return await Giveaway.aggregate([
    { $match: { platform: 'X' } },
    {
      $group: {
        _id: '$hostUsername',
        hostAvatarUrl: { $first: '$hostAvatarUrl' },
        totalGiveaways: { $sum: 1 },
        totalParticipants: { $sum: '$totalParticipants' },
      },
    },
    {
      $project: {
        _id: 1,
        avatarUrl: '$hostAvatarUrl',
        totalGiveaways: 1,
        totalParticipants: 1,
      }
    },
    { $sort: { totalGiveaways: -1 } },
    { $limit: 20 },
  ]);
}

async function handleVerifyCandidate({ body }: { body: { username: string; tweetId: string; config: Record<string, unknown> } }) {
  const { username, tweetId, config } = body;
  const result = await verifyCandidate(username, tweetId, config);
  return result;
}

// ── Routes ───────────────────────────────────────────────

export function xScrapeRoutes() {
  return new Elysia()
    .post('/api/x/draw/init', handleInitDraw, {
      body: t.Object({
        tweetId: t.String(),
        mode: t.Union([t.Literal('likes'), t.Literal('reposts')]),
        hostUsername: t.Optional(t.String()),
      }),
    });
}

// eslint-disable-next-line ai-guardrails/max-function-lines
export function xRoutes() {
  return new Elysia()
    .post('/api/x/verify', handleVerifyCandidate, {
      body: t.Object({
        username: t.String(),
        tweetId: t.String(),
        config: t.Object({
          mustPfp: t.Optional(t.Boolean()),
          mustBio: t.Optional(t.Boolean()),
          mustAge: t.Optional(t.Boolean()),
          minMonths: t.Optional(t.Number()),
          mustActivity: t.Optional(t.Boolean()),
          minPosts: t.Optional(t.Number()),
          mustComment: t.Optional(t.Boolean()),
        }),
      }),
    })
    .get('/api/x/draw/status/:id', handleDrawStatus)
    .post('/api/x/draw/save', handleSaveDraw, {
      body: t.Object({
        drawId: t.String(),
        tweetId: t.String(),
        hostUsername: t.String(),
        hostAvatarUrl: t.Optional(t.String()),
        mode: t.Union([t.Literal('likes'), t.Literal('reposts')]),
        totalParticipants: t.Number(),
        participants: t.Optional(t.Array(t.String())),
        enabledFeatures: t.Optional(t.Array(t.String())),
        engagementTasks: t.Optional(t.Object({
          mustLike: t.Optional(t.Boolean()),
          mustComment: t.Optional(t.Boolean()),
          mustFollow: t.Optional(t.Boolean()),
          followUsernames: t.Optional(t.Array(t.String())),
          mustExternal: t.Optional(t.Boolean()),
          externalUrl: t.Optional(t.String()),
          extMustLike: t.Optional(t.Boolean()),
          extMustRepost: t.Optional(t.Boolean()),
          extMustComment: t.Optional(t.Boolean()),
          extMustQuote: t.Optional(t.Boolean()),
        })),
        antiBotFilters: t.Optional(t.Object({
          mustPfp: t.Optional(t.Boolean()),
          mustBio: t.Optional(t.Boolean()),
          mustAge: t.Optional(t.Boolean()),
          minMonths: t.Optional(t.Number()),
          mustActivity: t.Optional(t.Boolean()),
          minPosts: t.Optional(t.Number()),
        })),
        winners: t.Array(
          t.Object({
            username: t.String(),
            type: t.String(),
            status: t.String(),
            avatarUrl: t.Optional(t.String()),
            commentProofUrl: t.Optional(t.String()),
          })
        ),
      }),
    })
    .get('/api/x/giveaways/history', handleHistory)
    .get('/api/x/giveaways/tweet/:tweetId', handleTweetHistory)
    .get('/api/x/giveaways/leaderboard', handleLeaderboard);
}
