import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PermissionChangeModal } from '../../src/components/PermissionChangeModal';

// Wrap component with required Router context for useNavigate()
function renderModal(
  open: boolean,
  type: 'permission-revoked' | 'permission-changed' = 'permission-revoked',
  documentTitle = 'Test Document'
) {
  return render(
    <MemoryRouter>
      <PermissionChangeModal open={open} type={type} documentTitle={documentTitle} />
    </MemoryRouter>
  );
}

describe('PermissionChangeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = renderModal(false);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when open is true', () => {
    renderModal(true);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows revoked title for permission-revoked type', () => {
    renderModal(true, 'permission-revoked');
    expect(screen.getByText('home.permissionRevoked')).toBeTruthy();
  });

  it('shows changed title for permission-changed type', () => {
    renderModal(true, 'permission-changed');
    expect(screen.getByText('home.permissionChanged')).toBeTruthy();
  });

  it('shows revoked description with document title', () => {
    renderModal(true, 'permission-revoked', 'My Doc');
    expect(screen.getByText('home.permissionRevokedDesc')).toBeTruthy();
  });

  it('shows changed description with document title', () => {
    renderModal(true, 'permission-changed', 'My Doc');
    expect(screen.getByText('home.permissionChangedDesc')).toBeTruthy();
  });

  it('shows redirect countdown', () => {
    renderModal(true);
    expect(screen.getByText('home.redirectCountdown')).toBeTruthy();
  });

  it('shows go home button', () => {
    renderModal(true);
    expect(screen.getByText('home.goHomeNow')).toBeTruthy();
  });

  it('displays error icon for revoked type', () => {
    renderModal(true, 'permission-revoked');
    const icon = document.querySelector('.text-error');
    expect(icon).toBeTruthy();
  });

  it('displays warning icon for changed type', () => {
    renderModal(true, 'permission-changed');
    const icon = document.querySelector('.text-warning');
    expect(icon).toBeTruthy();
  });
});
