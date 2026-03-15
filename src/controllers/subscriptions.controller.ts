import { Request, Response, NextFunction } from 'express';
import { SubscriptionsService } from '../services/subscriptions.service';
import { UnauthorizedError } from '../utils/errors';

const subscriptionsService = new SubscriptionsService();

export async function getEstado(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.userId) throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    const result = await subscriptionsService.getEstado(req.userId);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}
