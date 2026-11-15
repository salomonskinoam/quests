import express from 'express';
import type { Request, Response } from 'express';

import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

import { listRepos, readUser, saveRepo, saveUser } from './personalize.service.js';

/** quests: the HTTP surface of the Personalize form, mounted at /api/quests/personalize. */

const strings = (body: unknown, keys: string[]): Record<string, string> => {
  const b = (body ?? {}) as Record<string, unknown>;
  for (const k of keys) {
    if (typeof b[k] !== 'string') throw new AppError(`${k} must be text.`, { code: 'INVALID_REQUEST_BODY', statusCode: 400 });
  }
  return b as Record<string, string>;
};

const router = express.Router();

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json(createApiSuccessResponse({ user: readUser(), repos: listRepos() }));
}));

router.put('/user', asyncHandler(async (req: Request, res: Response) => {
  const b = strings(req.body, ['user', 'timeZone', 'ticketsRepo']);
  res.json(createApiSuccessResponse(saveUser({ user: b.user, timeZone: b.timeZone, ticketsRepo: b.ticketsRepo })));
}));

router.put('/repo', asyncHandler(async (req: Request, res: Response) => {
  const b = strings(req.body, ['path', 'areas', 'finishFile', 'finishSteps', 'finishCommand', 'drawerQuestion']);
  const enabled = (req.body as { enabled?: unknown }).enabled === true;
  res.json(createApiSuccessResponse(saveRepo({
    path: b.path, name: '', enabled, areas: b.areas, finishFile: b.finishFile, finishSteps: b.finishSteps,
    finishCommand: b.finishCommand, drawerQuestion: b.drawerQuestion,
  })));
}));

export default router;
