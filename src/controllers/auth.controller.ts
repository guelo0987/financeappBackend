import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import {
  ChangePasswordDTO,
  LoginDTO,
  RefreshDTO,
  RegisterDTO,
  UpdateProfileDTO,
} from '../types/auth.types';
import { UnauthorizedError } from '../utils/errors';

const authService = new AuthService();

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.register(req.body as RegisterDTO);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body as LoginDTO);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.refresh(req.body as RefreshDTO);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }
    await authService.logout(req.userId);
    res.json({ data: { mensaje: 'Sesión cerrada correctamente.' } });
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

export async function updatePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('NO_AUTORIZADO', 'No autorizado.');
    }
    await authService.changePassword(req.userId, req.body as ChangePasswordDTO);
    res.json({ data: { mensaje: 'Contraseña actualizada correctamente.' } });
  } catch (error) {
    next(error);
  }
}
