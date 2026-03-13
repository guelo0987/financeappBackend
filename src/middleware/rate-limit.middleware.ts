import rateLimit from 'express-rate-limit';

// Global: 200 req/min por IP
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      codigo: 'RATE_LIMIT',
      mensaje: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
    },
  },
});

// Auth: 10 req/min por IP (brute-force protection)
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      codigo: 'RATE_LIMIT',
      mensaje: 'Demasiados intentos. Espera un minuto antes de intentar de nuevo.',
    },
  },
});

// Invitations/email: 5 req/min por IP
export const emailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      codigo: 'RATE_LIMIT',
      mensaje: 'Demasiadas solicitudes de invitación. Espera un momento.',
    },
  },
});
