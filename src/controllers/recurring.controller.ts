import { NextFunction, Request, Response } from 'express';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import { RecurringService } from '../services/recurring.service';

const recurringService = new RecurringService();

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

export async function listRecurring(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const result = await recurringService.getAll(requireUserId(req), page, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function createRecurring(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await recurringService.create(requireUserId(req), req.body);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function updateRecurring(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parsePositiveInt(req.params.id, 'recurrenteId');
    const data = await recurringService.update(requireUserId(req), id, req.body);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function toggleRecurring(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parsePositiveInt(req.params.id, 'recurrenteId');
    const data = await recurringService.toggle(requireUserId(req), id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function deleteRecurring(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parsePositiveInt(req.params.id, 'recurrenteId');
    await recurringService.delete(requireUserId(req), id);
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

export async function processRecurring(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUserId(req);
    const data = await recurringService.processDueTransactions(userId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

