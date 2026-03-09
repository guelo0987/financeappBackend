import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../utils/errors';
import { DashboardService } from '../services/dashboard.service';

const dashboardService = new DashboardService();

export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('UNAUTHORIZED', 'No autorizado.');
    }
    const data = await dashboardService.getDashboard(req.userId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

