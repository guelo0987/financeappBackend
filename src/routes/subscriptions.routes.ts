import { Router } from 'express';
import { getEstado } from '../controllers/subscriptions.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/estado', authMiddleware, getEstado);

export default router;
