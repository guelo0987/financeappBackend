import { NextFunction, Request, Response } from 'express';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import { BudgetsService } from '../services/budgets.service';

const budgetsService = new BudgetsService();

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

export async function getBudgets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await budgetsService.getAll(requireUserId(req));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function createBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await budgetsService.create(requireUserId(req), req.body);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getBudgetById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    const data = await budgetsService.getById(requireUserId(req), budgetId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function updateBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    const data = await budgetsService.update(requireUserId(req), budgetId, req.body);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function deleteBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    await budgetsService.delete(requireUserId(req), budgetId);
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

export async function activateBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    await budgetsService.setActive(requireUserId(req), budgetId);
    res.json({ data: { activo: true } });
  } catch (error) {
    next(error);
  }
}

export async function getBudgetSpending(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    const data = await budgetsService.getSpending(requireUserId(req), budgetId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function addBudgetCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    const categoriaId = parsePositiveInt(req.body.categoriaId, 'categoriaId');
    const limite = Number(req.body.limite);
    await budgetsService.addCategoryLimit(requireUserId(req), budgetId, categoriaId, limite);
    res.status(201).json({ data: { creado: true } });
  } catch (error) {
    next(error);
  }
}

export async function updateBudgetCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    const categoriaId = parsePositiveInt(req.params.catId, 'categoriaId');
    const limite = Number(req.body.limite);
    await budgetsService.updateCategoryLimit(requireUserId(req), budgetId, categoriaId, limite);
    res.json({ data: { actualizado: true } });
  } catch (error) {
    next(error);
  }
}

export async function listBudgetMembers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    const data = await budgetsService.listMembers(requireUserId(req), budgetId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function removeBudgetMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    const targetUserId = parsePositiveInt(req.params.userId, 'userId');
    await budgetsService.removeMember(requireUserId(req), budgetId, targetUserId);
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

export async function deleteBudgetCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const budgetId = parsePositiveInt(req.params.id, 'budgetId');
    const categoriaId = parsePositiveInt(req.params.catId, 'categoriaId');
    await budgetsService.removeCategoryLimit(requireUserId(req), budgetId, categoriaId);
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

