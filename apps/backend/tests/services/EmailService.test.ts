import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../../src/services/EmailService.js';

// Hoist mock so vi.mock can reference it
const { mockSendMail } = vi.hoisted(() => ({
  mockSendMail: vi.fn().mockResolvedValue({ messageId: 'mock-id' }),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: mockSendMail,
    }),
  },
}));

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    emailService = new EmailService();
    vi.clearAllMocks();
    // Set env vars for the success-path tests
    process.env.PASSWORD_RESET_BASE_URL = 'https://example.com';
    process.env.SMTP_FROM = 'noreply@example.com';
  });

  afterAll(() => {
    delete process.env.PASSWORD_RESET_BASE_URL;
    delete process.env.SMTP_FROM;
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email successfully', async () => {
      await emailService.sendPasswordResetEmail('user@example.com', 'testuser', 'reset-token-123');

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toContain('Password Reset');
      expect(call.html).toContain('testuser');
      expect(call.html).toContain('reset-token-123');
      expect(call.html).toContain('https://example.com/password-reset/reset-token-123');
    });

    it('should throw error when PASSWORD_RESET_BASE_URL is not set', async () => {
      delete process.env.PASSWORD_RESET_BASE_URL;

      await expect(
        emailService.sendPasswordResetEmail('user@example.com', 'testuser', 'token')
      ).rejects.toThrow('PASSWORD_RESET_BASE_URL is not set');
    });

    it('should throw error when email (to) is missing', async () => {
      await expect(emailService.sendPasswordResetEmail('', 'testuser', 'token')).rejects.toThrow(
        'Missing required fields'
      );
    });

    it('should throw error when username is missing', async () => {
      await expect(
        emailService.sendPasswordResetEmail('user@example.com', '', 'token')
      ).rejects.toThrow('Missing required fields');
    });

    it('should throw error when reset token is missing', async () => {
      await expect(
        emailService.sendPasswordResetEmail('user@example.com', 'testuser', '')
      ).rejects.toThrow('Missing required fields');
    });
  });
});
