import { Router } from 'express';
import {
  changePassword,
  confirmEmailRedirectPage,
  passwordRecoveryRedirectPage,
  requestPasswordRecovery,
  me,
  session,
  setDefaultBudget,
  updateMe,
  deleteAccount,
} from '../controllers/auth.controller';
import { authMiddleware, supabaseAuthMiddleware } from '../middleware/auth';
import { emailLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

router.get('/confirm-email', confirmEmailRedirectPage);
router.get('/reset-password', passwordRecoveryRedirectPage);
router.post('/session', supabaseAuthMiddleware, session);
router.post('/password/recovery', emailLimiter, requestPasswordRecovery);
router.put('/password', authMiddleware, changePassword);
router.get('/me', authMiddleware, me);
router.patch('/me', authMiddleware, updateMe);
router.delete('/me', authMiddleware, deleteAccount);
router.patch('/me/default-budget', authMiddleware, setDefaultBudget);

export default router;
