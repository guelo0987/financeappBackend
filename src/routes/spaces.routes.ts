import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  cancelInvitation,
  deleteSpace,
  getSpace,
  listInvitations,
  listMembers,
  listSpaces,
  removeMember,
  updateMemberRole,
} from '../controllers/spaces.controller';

const router = Router();

router.use(authMiddleware);
router.get('/', listSpaces);
router.get('/:id', getSpace);
router.delete('/:id', deleteSpace);
router.get('/:id/members', listMembers);
router.patch('/:id/members/:userId', updateMemberRole);
router.delete('/:id/members/:userId', removeMember);
router.get('/:id/invitations', listInvitations);
router.delete('/:id/invitations/:invId', cancelInvitation);

export default router;

