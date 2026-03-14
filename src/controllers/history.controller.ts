import { NextFunction, Request, Response } from 'express';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import { HistoryService } from '../services/history.service';

const historyService = new HistoryService();

function requireUserId(req: Request): number {
  if (!req.userId) throw new UnauthorizedError('UNAUTHORIZED', 'No autorizado.');
  return req.userId;
}

function parsePositiveInt(value: unknown, label: string): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError('VALIDACION_ERROR', `${label} inválido.`);
  }
  return parsed;
}

export async function getBudgetHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const budgetId = parsePositiveInt(req.params.id, 'presupuestoId');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 12));
    const result = await historyService.getHistory(userId, budgetId, page, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
