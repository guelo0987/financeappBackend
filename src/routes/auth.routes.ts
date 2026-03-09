import { Router } from 'express';
import {
  login,
  logout,
  me,
  refresh,
  register,
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
router.put('/me', authMiddleware, updateMe);
router.put('/password', authMiddleware, updatePassword);

export default router;
