import { NextFunction, Request, Response } from 'express';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import { TransactionsService } from '../services/transactions.service';
import { TransactionFilters } from '../types/transactions.types';

const transactionsService = new TransactionsService();

function requireUserId(req: Request): number {
  if (!req.userId) throw new UnauthorizedError('UNAUTHORIZED', 'No autorizado.');
  return req.userId;
}

function parsePositiveInt(value: unknown, label: string): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError('VALIDACION_ERROR', `${label} inválido.`);
  }
  return parsed;
}

export async function listTransactions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters: TransactionFilters = {
      page: req.query.page ? parsePositiveInt(req.query.page, 'page') : 1,
      limit: req.query.limit ? parsePositiveInt(req.query.limit, 'limit') : 20,
      tipo: req.query.tipo as any,
      catKey: req.query.catKey ? String(req.query.catKey) : undefined,
      desde: req.query.desde ? String(req.query.desde) : undefined,
      hasta: req.query.hasta ? String(req.query.hasta) : undefined,
      walletId: req.query.walletId ? parsePositiveInt(req.query.walletId, 'walletId') : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
    };
    const result = await transactionsService.getAll(requireUserId(req), filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parsePositiveInt(req.params.id, 'transactionId');
    const data = await transactionsService.getById(requireUserId(req), id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function createTransaction(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await transactionsService.create(requireUserId(req), req.body);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function updateTransaction(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parsePositiveInt(req.params.id, 'transactionId');
    const data = await transactionsService.update(requireUserId(req), id, req.body);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function deleteTransaction(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parsePositiveInt(req.params.id, 'transactionId');
    await transactionsService.delete(requireUserId(req), id);
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

