import { Router } from 'express';
import { acceptInvitation } from '../controllers/spaces.controller';

const router = Router();

router.post('/:token/accept', acceptInvitation);

export default router;

