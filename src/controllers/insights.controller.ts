import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError, BadRequestError } from '../utils/errors';
import { InsightsService } from '../services/insights.service';

const insightsService = new InsightsService();

function parsePositiveInt(value: unknown, label: string): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError('VALIDACION_ERROR', `${label} inválido.`);
  }
  return parsed;
}

export async function getInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) throw new UnauthorizedError('UNAUTHORIZED', 'No autorizado.');
    const periodo = req.query.periodo ? String(req.query.periodo) : 'mensual';
    const presupuestoId = req.query.presupuestoId
      ? parsePositiveInt(req.query.presupuestoId, 'presupuestoId')
      : undefined;

    const data = await insightsService.getInsights(req.userId, periodo, presupuestoId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

