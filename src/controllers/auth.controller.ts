import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { SupabaseSessionDTO, UpdateProfileDTO } from '../types/auth.types';
import { UnauthorizedError } from '../utils/errors';

const authService = new AuthService();

export async function session(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.supabaseUser) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }

    const result = await authService.syncSupabaseUser(
      req.supabaseUser,
      req.body as SupabaseSessionDTO,
    );
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }
    const result = await authService.getProfile(req.userId);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }
    const result = await authService.updateProfile(req.userId, req.body as UpdateProfileDTO);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function setDefaultBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    const presupuestoId = req.body.presupuesto_id === null ? null : Number(req.body.presupuesto_id);
    await authService.setDefaultBudget(req.userId, presupuestoId);
    res.json({ data: { presupuesto_default_id: presupuestoId } });
  } catch (error) {
    next(error);
  }
}
