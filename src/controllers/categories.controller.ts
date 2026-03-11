import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../utils/errors';
import { CategoriesService } from '../services/categories.service';

const categoriesService = new CategoriesService();

function getUserId(req: Request): number {
  if (!req.userId) {
    throw new UnauthorizedError('UNAUTHORIZED', 'No autorizado.');
  }
  return req.userId;
}

function parseTipoFilter(req: Request): string | undefined {
  const tipo = req.query.tipo ? String(req.query.tipo).toLowerCase() : undefined;
  if (tipo && !['ingreso', 'gasto', 'transferencia'].includes(tipo)) {
    return undefined;
  }
  return tipo;
}

export async function getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const formato = String(req.query.formato ?? 'grouped').toLowerCase();
    const tipo = parseTipoFilter(req);
    const data =
      formato === 'flat'
        ? await categoriesService.getAllForUser(getUserId(req), tipo)
        : await categoriesService.getGroupedForUser(getUserId(req), tipo);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getSystemCategories(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tipo = parseTipoFilter(req);
    const data = await categoriesService.getSystemCategories(tipo);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getParentCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tipo = parseTipoFilter(req);
    const data = await categoriesService.getParentsForUser(getUserId(req), tipo);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function createParentCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await categoriesService.createParent(getUserId(req), req.body);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await categoriesService.create(getUserId(req), req.body);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const data = await categoriesService.update(getUserId(req), id, req.body);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    await categoriesService.delete(getUserId(req), id);
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}
