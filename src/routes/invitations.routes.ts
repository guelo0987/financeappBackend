import { Router } from 'express';
import { acceptInvitation, acceptInvitationPage } from '../controllers/spaces.controller';

const router = Router();

router.get('/:token/accept', acceptInvitationPage);
router.post('/:token/accept', acceptInvitation);

export default router;

