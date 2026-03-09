import { Request, Response, NextFunction } from 'express';
import { verificarToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('TOKEN_REQUERIDO', 'Se requiere un token de autenticación.');
  }

  try {
    const token = header.split(' ')[1];
    const payload = verificarToken(token);
    if (payload.type !== 'access') {
      throw new UnauthorizedError('TOKEN_INVALIDO', 'El token no es válido para esta operación.');
    }
    req.user = payload;
    req.userId = payload.sub;
    next();
  } catch {
    throw new UnauthorizedError('TOKEN_INVALIDO', 'El token es inválido o ha expirado.');
  }
}
