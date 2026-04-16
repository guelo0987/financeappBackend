import { Router } from 'express';
import {
  confirmEmailRedirectPage,
  me,
  session,
  setDefaultBudget,
  updateMe,
} from '../controllers/auth.controller';
import { authMiddleware, supabaseAuthMiddleware } from '../middleware/auth';

const router = Router();

router.get('/confirm-email', confirmEmailRedirectPage);
router.post('/session', supabaseAuthMiddleware, session);
router.get('/me', authMiddleware, me);
router.patch('/me', authMiddleware, updateMe);
router.patch('/me/default-budget', authMiddleware, setDefaultBudget);

export default router;
