import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        codigo: err.codigo,
        mensaje: err.mensaje,
      },
    });
    return;
  }

  console.error('Error no controlado:', err);

  res.status(500).json({
    error: {
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ha ocurrido un error interno del servidor.',
    },
  });
}
