import { NextFunction, Request, Response } from 'express';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import { AlertsService } from '../services/alerts.service';

const alertsService = new AlertsService();

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

export async function getAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const soloNoLeidas = req.query.no_leidas === 'true';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await alertsService.getAll(requireUserId(req), soloNoLeidas, page, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await alertsService.getUnreadCount(requireUserId(req));
    res.json({ data: { no_leidas: count } });
  } catch (error) {
    next(error);
  }
}

export async function markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const alertId = parsePositiveInt(req.params.id, 'alertId');
    const data = await alertsService.markAsRead(requireUserId(req), alertId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await alertsService.markAllAsRead(requireUserId(req));
    res.json({ data: { actualizado: true } });
  } catch (error) {
    next(error);
  }
}
