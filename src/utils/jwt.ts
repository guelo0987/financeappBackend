import jwt, { SignOptions } from 'jsonwebtoken';
import { JwtPayload } from '../types/auth.types';
import { env } from '../config/env';

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN;
const JWT_REFRESH_EXPIRES_IN = env.JWT_REFRESH_EXPIRES_IN;

function signToken(payload: JwtPayload, expiresIn: string): string {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN as any };
  options.expiresIn = expiresIn as any;
  return jwt.sign(payload, JWT_SECRET, options);
}

export function generarAccessToken(userId: number, email: string): string {
  return signToken({ sub: userId, email, type: 'access' }, JWT_EXPIRES_IN);
}

export function generarRefreshToken(userId: number, email: string): string {
  return signToken({ sub: userId, email, type: 'refresh' }, JWT_REFRESH_EXPIRES_IN);
}

export function verificarToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
}
