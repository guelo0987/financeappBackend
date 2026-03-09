import { NextFunction, Request, Response } from 'express';
import { BadRequestError, UnauthorizedError } from '../utils/errors';
import { SpacesService } from '../services/spaces.service';

const spacesService = new SpacesService();

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

export async function listSpaces(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.listSpaces(requireUserId(req));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function createSpace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.createSpace(
      requireUserId(req),
      String(req.body.nombre ?? ''),
      req.body.descripcion ?? null,
    );
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getSpace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.getSpace(requireUserId(req), parsePositiveInt(req.params.id, 'spaceId'));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function deleteSpace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await spacesService.deleteSpace(requireUserId(req), parsePositiveInt(req.params.id, 'spaceId'));
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

export async function inviteMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.inviteMember(
      requireUserId(req),
      parsePositiveInt(req.params.id, 'spaceId'),
      String(req.body.email ?? ''),
    );
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.listMembers(requireUserId(req), parsePositiveInt(req.params.id, 'spaceId'));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await spacesService.updateMemberRole(
      requireUserId(req),
      parsePositiveInt(req.params.id, 'spaceId'),
      parsePositiveInt(req.params.userId, 'userId'),
      String(req.body.rol ?? ''),
    );
    res.json({ data: { actualizado: true } });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await spacesService.removeMember(
      requireUserId(req),
      parsePositiveInt(req.params.id, 'spaceId'),
      parsePositiveInt(req.params.userId, 'userId'),
    );
    res.json({ data: { eliminado: true } });
  } catch (error) {
    next(error);
  }
}

export async function listInvitations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await spacesService.listInvitations(requireUserId(req), parsePositiveInt(req.params.id, 'spaceId'));
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function cancelInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await spacesService.cancelInvitation(
      requireUserId(req),
      parsePositiveInt(req.params.id, 'spaceId'),
      parsePositiveInt(req.params.invId, 'invitationId'),
    );
    res.json({ data: { cancelada: true } });
  } catch (error) {
    next(error);
  }
}

export async function acceptInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = String(req.params.token ?? '');
    const email = String(req.body.email ?? '');
    const data = await spacesService.acceptInvitation(token, email);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

