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

export async function getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const formato = String(req.query.formato ?? 'grouped').toLowerCase();
    const data =
      formato === 'flat'
        ? await categoriesService.getAllForUser(getUserId(req))
        : await categoriesService.getGroupedForUser(getUserId(req));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getSystemCategories(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await categoriesService.getSystemCategories();
    res.json({ data });
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
