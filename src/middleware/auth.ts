import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { UnauthorizedError } from '../utils/errors';

const authService = new AuthService();

function extractBearerToken(header?: string): string {
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('TOKEN_REQUERIDO', 'Se requiere un token de autenticación.');
  }

  return header.slice('Bearer '.length).trim();
}

export async function supabaseAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    const user = await authService.verifySupabaseToken(token);

    req.supabaseUser = user;
    req.supabaseAuthUserId = user.id;
    req.userEmail = user.email ?? undefined;

    next();
  } catch (error) {
    next(error);
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await supabaseAuthMiddleware(req, res, async (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }

    try {
      if (!req.supabaseAuthUserId) {
        throw new UnauthorizedError('TOKEN_INVALIDO', 'La cuenta autenticada no es válida.');
      }

      const userId = await authService.getUserIdBySupabaseAuthUserId(req.supabaseAuthUserId);
      if (!userId) {
        throw new UnauthorizedError(
          'PERFIL_NO_SINCRONIZADO',
          'La cuenta autenticada todavía no tiene un perfil inicializado.',
        );
      }

      req.userId = userId;
      next();
    } catch (innerError) {
      next(innerError);
    }
  });
}
