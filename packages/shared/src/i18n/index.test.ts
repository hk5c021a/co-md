import { describe, it, expect } from 'vitest';
import {
  authKeys,
  documentKeys,

  permissionKeys,
  contactKeys,
  notificationKeys,
  commonKeys,
} from './index.js';

describe('i18n keys', () => {
  describe('authKeys', () => {
    it('contains expected keys', () => {
      expect(authKeys['auth:usernameRequired']).toBeTruthy();
      expect(authKeys['auth:emailRequired']).toBeTruthy();
      expect(authKeys['auth:passwordRequired']).toBeTruthy();
      expect(authKeys['auth:passwordsDoNotMatch']).toBeTruthy();
      expect(authKeys['auth:sessionExpired']).toBeTruthy();
      expect(authKeys['auth:sessionForced']).toBeTruthy();
    });

    it('all keys follow auth: prefix convention', () => {
      for (const key of Object.keys(authKeys)) {
        expect(key).toMatch(/^auth:/);
      }
    });
  });

  describe('documentKeys', () => {
    it('contains expected keys', () => {
      expect(documentKeys['document:notFound']).toBeTruthy();
      expect(documentKeys['document:forbidden']).toBeTruthy();
      expect(documentKeys['document:createSuccess']).toBeTruthy();
      expect(documentKeys['document:deleteSuccess']).toBeTruthy();
    });
  });

  describe('permissionKeys', () => {
    it('contains expected keys', () => {
      expect(permissionKeys['permission:granted']).toBeTruthy();
      expect(permissionKeys['permission:revoked']).toBeTruthy();
      expect(permissionKeys['permission:changed']).toBeTruthy();
    });
  });

  describe('contactKeys', () => {
    it('contains expected keys', () => {
      expect(contactKeys['contact:invitationSent']).toBeTruthy();
      expect(contactKeys['contact:invitationReceived']).toBeTruthy();
      expect(contactKeys['contact:removed']).toBeTruthy();
    });
  });

  describe('notificationKeys', () => {
    it('contains expected keys', () => {
      expect(notificationKeys['notification:permissionGranted']).toBeTruthy();
      expect(notificationKeys['notification:permissionRevoked']).toBeTruthy();
      expect(notificationKeys['notification:contactInvitation']).toBeTruthy();
    });
  });

  describe('commonKeys', () => {
    it('contains expected keys', () => {
      expect(commonKeys['common:loading']).toBeTruthy();
      expect(commonKeys['common:error']).toBeTruthy();
      expect(commonKeys['common:cancel']).toBeTruthy();
      expect(commonKeys['common:confirm']).toBeTruthy();
      expect(commonKeys['common:save']).toBeTruthy();
      expect(commonKeys['common:delete']).toBeTruthy();
    });
  });
});
