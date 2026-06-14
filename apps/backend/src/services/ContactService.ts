import { randomUUID } from 'node:crypto';
import { auditLog } from '../lib/audit.js';
import {
  userRepository,
  contactRepository,
  invitationRepository,
  notificationRepository,
  permissionRepository,
  documentRepository,
} from '../repositories/index.js';
import { db } from '../db/index.js';
import { redis } from '../db/redis.js';
import { permissionCache } from './CacheService.js';
import { logger } from '../lib/logger.js';
import { publishUserNotification } from './notificationPublisher.js';
import type { ContactInvitation, User } from '../db/schema.js';

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export interface SearchUsersResult {
  id: string;
  username: string;
}

export class ContactService {
  async searchUsers(query: string, excludeUserId: string): Promise<SearchUsersResult[]> {
    const matches = await userRepository.searchByFuzzy(query, excludeUserId);
    // Exclude users who are already contacts
    const existingContacts = await contactRepository.findByUserId(excludeUserId);
    const contactIds = new Set(existingContacts.map((c) => c.contactUserId));
    return matches
      .filter((u) => !contactIds.has(u.id))
      .map((u) => ({
        id: u.id,
        username: u.username,
      }));
  }

  async getContacts(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<{ items: { id: string; username: string; email: string; phone: string; addedAt: Date }[]; total: number }> {
    const [contacts, total] = await Promise.all([
      contactRepository.findByUserId(userId, limit, offset),
      contactRepository.countByUserId(userId),
    ]);
    if (contacts.length === 0) return { items: [], total: 0 };

    const contactUserIds = contacts.map((c) => c.contactUserId);
    const users = await userRepository.findByIds(contactUserIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = contacts
      .filter((c) => userMap.has(c.contactUserId))
      .map((c) => ({
        id: c.contactUserId,
        username: userMap.get(c.contactUserId)!.username,
        email: userMap.get(c.contactUserId)!.email,
        phone: userMap.get(c.contactUserId)!.phone,
        addedAt: c.createdAt,
      }));
    return { items, total };
  }

  async getContactUser(userId: string, contactUserId: string): Promise<User | null> {
    const isContact = await contactRepository.areContacts(userId, contactUserId);
    if (!isContact) {
      return null;
    }
    return userRepository.findById(contactUserId);
  }

  async sendInvitation(inviterId: string, inviteeId: string): Promise<ContactInvitation> {
    // Cannot invite yourself
    if (inviterId === inviteeId) {
      throw new ContactError('INVALID_TARGET', 'Cannot send invitation to yourself');
    }

    // Check if invitee exists
    const invitee = await userRepository.findById(inviteeId);
    if (!invitee) {
      throw new ContactError('USER_NOT_FOUND', 'User not found');
    }

    // Check if already contacts
    const alreadyContacts = await contactRepository.areContacts(inviterId, inviteeId);
    if (alreadyContacts) {
      throw new ContactError('ALREADY_CONTACTS', 'You are already contacts with this user');
    }

    // Check for pending invitation
    const hasPending = await invitationRepository.existsPendingBetweenUsers(inviterId, inviteeId);
    if (hasPending) {
      throw new ContactError('INVITATION_EXISTS', 'A pending invitation already exists');
    }

    const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    // NOTE: invitation creation + notification creation are not wrapped in a DB transaction
    // because the repository layer does not support passing tx objects.
    // This is acceptable eventual consistency — if notification creation fails,
    // the invitation still exists and will expire naturally.
    const invitation = await invitationRepository.create({
      id: randomUUID(),
      inviterId,
      inviteeId,
      expiresAt,
    });

    // Create notification for invitee (best-effort — will be backfilled on query)
    const inviter = await userRepository.findById(inviterId);
    const notifId = randomUUID();
    try {
      await notificationRepository.create({
        id: notifId,
        userId: inviteeId,
        type: 'contact-invitation',
        content: `${inviter?.username || 'Someone'} sent you a contact invitation`,
        metadata: {
          invitationId: invitation.id,
          inviterId,
          inviterUsername: inviter?.username || 'Someone',
        },
      });
    } catch (err) {
      logger.warn('Notification creation failed for invitation (will be backfilled on query)', {
        invitationId: invitation.id,
        inviteeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Publish real-time notification (fire-and-forget)
    publishUserNotification(inviteeId, {
      type: 'contact-invitation',
      data: {
        invitationId: invitation.id,
        inviterId,
        inviterUsername: inviter?.username || 'Someone',
      },
    }).catch((err) => {
      logger.warn('Real-time notification publish failed', {
        invitationId: invitation.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    auditLog('contact.invite', {
      'audit.user_id': inviterId,
      'audit.target_user_id': inviteeId,
    });
    return invitation;
  }

  async getPendingInvitations(userId: string): Promise<ContactInvitation[]> {
    const invitations = await invitationRepository.findByInviteeId(userId);
    const now = new Date();

    // Filter and update expired ones
    const valid: ContactInvitation[] = [];
    for (const inv of invitations) {
      if (inv.status === 'pending') {
        if (inv.expiresAt < now) {
          // Mark as expired
          await invitationRepository.updateStatus(inv.id, 'expired');
          // Also mark the associated notification
          try {
            const notif = await notificationRepository.findByInvitationId(inv.id);
            if (notif) {
              await notificationRepository.updateMetadata(notif.id, { invitationStatus: 'expired' });
            }
          } catch { /* non-critical */ }
        } else {
          valid.push(inv);
        }
      }
    }

    // Backfill: batch-check existing notifications and inviters (avoids N+1 queries)
    if (valid.length > 0) {
      const notifIds = valid.map(inv => inv.id);
      const inviterIds = [...new Set(valid.map(inv => inv.inviterId))];
      const [existingNotifs, inviters] = await Promise.all([
        notificationRepository.findByIds(notifIds),
        userRepository.findByIds(inviterIds),
      ]);
      const existingIds = new Set(existingNotifs.map(n => n.id));
      const inviterMap = new Map(inviters.map(u => [u.id, u]));

      for (const inv of valid) {
        if (existingIds.has(inv.id)) continue;
        try {
          const inviter = inviterMap.get(inv.inviterId);
          await notificationRepository.create({
            id: inv.id,
            userId: inv.inviteeId,
            type: 'contact-invitation',
            content: `${inviter?.username || 'Someone'} sent you a contact invitation`,
            metadata: {
              invitationId: inv.id,
              inviterId: inv.inviterId,
              inviterUsername: inviter?.username || 'Someone',
            },
          });
        } catch (err) {
          logger.warn('Failed to backfill notification for invitation', {
            invitationId: inv.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Backfill: update notification metadata for already-resolved invitations
    // (accepted / declined). This ensures the frontend hides action buttons
    // after page refresh (the notification client-side state is ephemeral).
    const resolved = invitations.filter(
      (inv) => inv.status === 'accepted' || inv.status === 'declined'
    );
    if (resolved.length > 0) {
      for (const inv of resolved) {
        try {
          const notif = await notificationRepository.findByInvitationId(inv.id);
          if (notif && !(notif.metadata as Record<string, unknown> | undefined)?.invitationStatus) {
            await notificationRepository.updateMetadata(notif.id, {
              invitationStatus: inv.status,
            });
          }
        } catch (err) {
          logger.warn('Failed to backfill invitation notification status', {
            invitationId: inv.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return valid;
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<void> {
    const invitation = await invitationRepository.findById(invitationId);
    if (!invitation) {
      throw new ContactError('NOT_FOUND', 'Invitation not found');
    }

    if (invitation.inviteeId !== userId) {
      throw new ContactError('ACCESS_DENIED', 'This invitation is not for you');
    }

    if (invitation.status !== 'pending') {
      throw new ContactError('INVITATION_EXPIRED', 'This invitation is no longer valid');
    }

    if (invitation.expiresAt < new Date()) {
      await invitationRepository.updateStatus(invitationId, 'expired');
      throw new ContactError('INVITATION_EXPIRED', 'This invitation has expired');
    }

    // Atomically create contacts + update invitation status
    try {
      await db.transaction(async (tx) => {
        await contactRepository.createBidirectional(invitation.inviterId, invitation.inviteeId, tx);
        await invitationRepository.updateStatus(invitationId, 'accepted', tx);
      });
    } catch (err) {
      // Concurrent acceptance — unique violation on contacts pair
      if (isPgError(err) && err.code === '23505') {
        throw new ContactError('ALREADY_CONTACTS', 'You are already contacts with this user');
      }
      throw err;
    }

    // Notify inviter (outside transaction — non-critical, can retry)
    const invitee = await userRepository.findById(userId);
    const notifId = randomUUID();
    try {
      await notificationRepository.create({
        id: notifId,
        userId: invitation.inviterId,
        type: 'contact-added',
        content: `${invitee?.username || 'Someone'} accepted your contact invitation`,
        metadata: { contactUserId: userId, contactUsername: invitee?.username || 'Someone' },
      });
    } catch (err) {
      logger.warn('Accept notification creation failed', { invitationId, error: err });
    }

    // Publish real-time notification (fire-and-forget)
    publishUserNotification(invitation.inviterId, {
      type: 'contact-added',
      data: {
        contactUserId: userId,
        contactUsername: invitee?.username || 'Someone',
      },
    }).catch((err) => {
      logger.warn('Accept notification publish failed', { invitationId, error: err });
    });

    // Mark the original invitation notification as resolved (so the client hides action buttons)
    try {
      const notif = await notificationRepository.findByInvitationId(invitationId);
      if (notif) {
        await notificationRepository.updateMetadata(notif.id, { invitationStatus: 'accepted' });
      }
    } catch (err) {
      logger.warn('Failed to update invitation notification metadata', { invitationId, error: err });
    }

    auditLog('contact.accept', {
      'audit.user_id': userId,
      'audit.target_user_id': invitation.inviterId,
    });
  }

  async declineInvitation(invitationId: string, userId: string): Promise<void> {
    const invitation = await invitationRepository.findById(invitationId);
    if (!invitation) {
      throw new ContactError('NOT_FOUND', 'Invitation not found');
    }

    if (invitation.inviteeId !== userId) {
      throw new ContactError('ACCESS_DENIED', 'This invitation is not for you');
    }

    if (invitation.status !== 'pending') {
      throw new ContactError('INVITATION_EXPIRED', 'This invitation is no longer valid');
    }

    await invitationRepository.updateStatus(invitationId, 'declined');

    // Mark the original invitation notification as resolved
    try {
      const notif = await notificationRepository.findByInvitationId(invitationId);
      if (notif) {
        await notificationRepository.updateMetadata(notif.id, { invitationStatus: 'declined' });
      }
    } catch (err) {
      logger.warn('Failed to update invitation notification metadata', { invitationId, error: err });
    }

    auditLog('contact.decline', {
      'audit.user_id': userId,
      'audit.target_user_id': invitation.inviterId,
    });
  }

  async removeContact(userId: string, contactUserId: string): Promise<void> {
    const isContact = await contactRepository.areContacts(userId, contactUserId);
    if (!isContact) {
      throw new ContactError('NOT_CONTACT', 'This user is not your contact');
    }

    // Revoke permissions in both directions, then remove contact.
    // If we crash mid-way, the contact still exists so the operation can be safely retried.

    // Batch-revoke: query all permissions for both users, then filter in-memory
    const [myPerms, theirPerms] = await Promise.all([
      permissionRepository.findByUserId(contactUserId),
      permissionRepository.findByUserId(userId),
    ]);

    const myDocIds = new Set((await documentRepository.findByOwnerId(userId)).map(d => d.id));
    const theirDocIds = new Set((await documentRepository.findByOwnerId(contactUserId)).map(d => d.id));

    for (const perm of myPerms) {
      if (myDocIds.has(perm.documentId)) {
        await permissionRepository.delete(perm.id);
        await permissionCache.delete(`${perm.documentId}:${contactUserId}`);
      }
    }
    for (const perm of theirPerms) {
      if (theirDocIds.has(perm.documentId)) {
        await permissionRepository.delete(perm.id);
        await permissionCache.delete(`${perm.documentId}:${userId}`);
      }
    }

    // Remove bidirectional contact relationship
    await contactRepository.deleteBidirectional(userId, contactUserId);

    // Notify the removed user (single consolidated notification, not per-permission)
    const remover = await userRepository.findById(userId);
    const removerName = remover?.username || 'Someone';
    await notificationRepository.create({
      id: randomUUID(),
      userId: contactUserId,
      type: 'contact-removed',
      content: `${removerName} removed you from contacts`,
      metadata: { removerId: userId, removerUsername: removerName },
    });

    // Publish real-time notification so the removed user's page refreshes
    await publishUserNotification(contactUserId, {
      type: 'contact-removed',
      data: {
        removerId: userId,
        removerUsername: removerName,
      },
    });

    // Also notify the remover so their documents/permissions list updates.
    // The mutation's onSuccess handles the contacts list, but the documents
    // list (shared via permissions) needs cache invalidation via WS.
    const removedUser = await userRepository.findById(contactUserId);
    const removedName = removedUser?.username || 'Someone';
    await publishUserNotification(userId, {
      type: 'contact-removed',
      data: {
        removerId: userId,
        removerUsername: removerName,
        removedUsername: removedName,
      },
    });

    auditLog('contact.remove', {
      'audit.user_id': userId,
      'audit.target_user_id': contactUserId,
    });
  }

  async getOutgoingInvitations(userId: string): Promise<ContactInvitation[]> {
    return invitationRepository.findByInviterId(userId);
  }

}

export class ContactError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ContactError';
  }
}

export const contactService = new ContactService();
