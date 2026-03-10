import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';

type ParseError = Error & {
  body?: string;
  status?: number;
  type?: string;
};

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const parseError = err as ParseError;

  if (parseError.type === 'entity.parse.failed' || (err instanceof SyntaxError && parseError.status === 400)) {
    res.status(400).json({
      error: {
        codigo: 'JSON_INVALIDO',
        mensaje: 'El cuerpo JSON es invalido. Revisa comas sobrantes y usa comillas dobles en las propiedades.',
      },
    });
    return;
  }

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
