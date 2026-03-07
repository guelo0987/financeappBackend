export class AppError extends Error {
  constructor(
    public statusCode: number,
    public codigo: string,
    public mensaje: string,
  ) {
    super(mensaje);
    this.name = 'AppError';
  }
}

export class BadRequestError extends AppError {
  constructor(codigo: string, mensaje: string) {
    super(400, codigo, mensaje);
  }
}

export class UnauthorizedError extends AppError {
  constructor(codigo: string = 'NO_AUTORIZADO', mensaje: string = 'No autorizado.') {
    super(401, codigo, mensaje);
  }
}

export class ConflictError extends AppError {
  constructor(codigo: string, mensaje: string) {
    super(409, codigo, mensaje);
  }
}

export class NotFoundError extends AppError {
  constructor(codigo: string, mensaje: string) {
    super(404, codigo, mensaje);
  }
}
