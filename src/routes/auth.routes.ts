import { Router } from 'express';
import {
  me,
  session,
  setDefaultBudget,
  updateMe,
} from '../controllers/auth.controller';
import { authMiddleware, supabaseAuthMiddleware } from '../middleware/auth';

const router = Router();

router.post('/session', supabaseAuthMiddleware, session);
router.get('/me', authMiddleware, me);
router.patch('/me', authMiddleware, updateMe);
router.patch('/me/default-budget', authMiddleware, setDefaultBudget);

export default router;
