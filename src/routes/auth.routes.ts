import { Router } from 'express';
import {
  login,
  logout,
  me,
  refresh,
  register,
  setDefaultBudget,
  updateMe,
  updatePassword,
} from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authMiddleware, logout);
router.get('/me', authMiddleware, me);
router.patch('/me', authMiddleware, updateMe);
router.put('/password', authMiddleware, updatePassword);
router.patch('/me/default-budget', authMiddleware, setDefaultBudget);

export default router;
