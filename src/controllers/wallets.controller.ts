import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError, BadRequestError } from '../utils/errors';
import { WalletsService } from '../services/wallets.service';

const walletsService = new WalletsService();

function requireUserId(req: Request): number {
  if (!req.userId) {
    throw new UnauthorizedError('UNAUTHORIZED', 'No autorizado.');
  }
  return req.userId;
}

function parseId(value: unknown, label: string): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError('VALIDACION_ERROR', `${label} inválido.`);
  }
  return parsed;
}

function parseQueryInt(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function getWallets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await walletsService.getAll(requireUserId(req));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function createWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await walletsService.create(requireUserId(req), req.body);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getWalletById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const walletId = parseId(req.params.id, 'walletId');
    const data = await walletsService.getById(requireUserId(req), walletId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function updateWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const walletId = parseId(req.params.id, 'walletId');
    const data = await walletsService.update(requireUserId(req), walletId, req.body);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function deleteWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const walletId = parseId(req.params.id, 'walletId');
    await walletsService.softDelete(requireUserId(req), walletId);
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

export async function getWalletTransactions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const walletId = parseId(req.params.id, 'walletId');
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 20);
    const result = await walletsService.getTransactions(requireUserId(req), walletId, page, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getWalletSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await walletsService.getSummary(requireUserId(req));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}
