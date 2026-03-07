import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

const authService = new AuthService();

export async function registro(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.registro(req.body);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}
