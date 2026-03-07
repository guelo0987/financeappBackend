import { Router } from 'express';
import { registro, login } from '../controllers/auth.controller';

const router = Router();

router.post('/registro', registro);
router.post('/login', login);

export default router;
