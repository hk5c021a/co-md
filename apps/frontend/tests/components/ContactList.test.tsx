import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContactList } from '../../src/components/ContactList';

// Mock hooks - using factory pattern for ESM compatibility
const mockUseContacts = vi.fn();
const mockUseRemoveContact = vi.fn();

vi.mock('../../src/hooks/useApi', () => ({
  useContacts: () => mockUseContacts(),
  useRemoveContact: () => mockUseRemoveContact(),
}));

describe('ContactList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseContacts.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseRemoveContact.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it('renders loading skeletons', () => {
    mockUseContacts.mockReturnValue({
      data: [],
      isLoading: true,
    });

    render(<ContactList />);

    // Loading state renders skeleton cards with animate-pulse
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders empty state when no contacts', () => {
    mockUseContacts.mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<ContactList />);

    expect(screen.getByText('home.noContacts')).toBeTruthy();
  });

  it('renders contact list when contacts exist', () => {
    mockUseContacts.mockReturnValue({
      data: [
        {
          id: 'user-1',
          username: 'johndoe',
          email: 'john@example.com',
          phone: '1234567890',
          addedAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    render(<ContactList />);

    expect(screen.getByText('johndoe')).toBeTruthy();
    expect(screen.getByText('john@example.com')).toBeTruthy();
  });

  it('shows user avatar with first letter of username', () => {
    mockUseContacts.mockReturnValue({
      data: [
        {
          id: 'user-1',
          username: 'alice',
          email: 'alice@example.com',
          phone: '1234567890',
          addedAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    render(<ContactList />);

    expect(screen.getByText('A')).toBeTruthy();
  });

  it('calls onSelect when contact is clicked', () => {
    const onSelect = vi.fn();
    mockUseContacts.mockReturnValue({
      data: [
        {
          id: 'user-1',
          username: 'johndoe',
          email: 'john@example.com',
          phone: '1234567890',
          addedAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    render(<ContactList onSelect={onSelect} />);

    fireEvent.click(screen.getByText('johndoe'));
    expect(onSelect).toHaveBeenCalledWith({
      id: 'user-1',
      username: 'johndoe',
      email: 'john@example.com',
      phone: '1234567890',
      addedAt: expect.any(String),
    });
  });

  it('calls removeContact when remove button is clicked and confirmed', () => {
    const removeMutation = vi.fn();
    mockUseRemoveContact.mockReturnValue({
      mutate: removeMutation,
      isPending: false,
    });

    mockUseContacts.mockReturnValue({
      data: [
        {
          id: 'user-1',
          username: 'johndoe',
          email: 'john@example.com',
          phone: '1234567890',
          addedAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    render(<ContactList />);

    // Click remove button — opens confirmation dialog
    fireEvent.click(screen.getByTitle('home.removeContact'));
    // Click confirm button in dialog (the last button with this text)
    const buttons = screen.getAllByText('home.removeContact');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(removeMutation).toHaveBeenCalledWith('user-1', expect.any(Object));
  });

  it('does not call onSelect when remove button is clicked', () => {
    const onSelect = vi.fn();
    const removeMutation = vi.fn();
    mockUseRemoveContact.mockReturnValue({
      mutate: removeMutation,
      isPending: false,
    });

    mockUseContacts.mockReturnValue({
      data: [
        {
          id: 'user-1',
          username: 'johndoe',
          email: 'john@example.com',
          phone: '1234567890',
          addedAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    render(<ContactList onSelect={onSelect} />);

    fireEvent.click(screen.getByTitle('home.removeContact'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders multiple contacts', () => {
    mockUseContacts.mockReturnValue({
      data: [
        {
          id: 'user-1',
          username: 'alice',
          email: 'alice@example.com',
          phone: '1111111111',
          addedAt: new Date().toISOString(),
        },
        {
          id: 'user-2',
          username: 'bob',
          email: 'bob@example.com',
          phone: '2222222222',
          addedAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    render(<ContactList />);

    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.getAllByTitle('home.removeContact')).toHaveLength(2);
  });

  it('disables remove button when removing contact', () => {
    mockUseRemoveContact.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    });

    mockUseContacts.mockReturnValue({
      data: [
        {
          id: 'user-1',
          username: 'johndoe',
          email: 'john@example.com',
          phone: '1234567890',
          addedAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    render(<ContactList />);

    expect(screen.getByTitle('home.removeContact')).toBeDisabled();
  });
});
