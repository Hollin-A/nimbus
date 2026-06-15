import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PasswordResetConfirmPage from '../pages/PasswordResetConfirmPage';
import { ApiError } from '../api/client';

const { mockConfirm } = vi.hoisted(() => ({ mockConfirm: vi.fn() }));

vi.mock('../api/client', async (importActual) => {
  const actual = await importActual<typeof import('../api/client')>();
  return { ...actual, confirmPasswordReset: mockConfirm };
});

function renderPage(entry = '/reset/confirm') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PasswordResetConfirmPage />
    </MemoryRouter>,
  );
}

describe('PasswordResetConfirmPage', () => {
  beforeEach(() => mockConfirm.mockReset());

  it('pre-fills the token from the URL query', () => {
    renderPage('/reset/confirm?token=from-the-link');
    expect(screen.getByLabelText(/reset token/i)).toHaveValue('from-the-link');
  });

  it('confirms with the token + password and shows the success state', async () => {
    mockConfirm.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderPage('/reset/confirm?token=tok-123');

    await user.type(screen.getByLabelText(/new password/i), 'brand-new-pass');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(mockConfirm).toHaveBeenCalledWith('tok-123', 'brand-new-pass');
    expect(await screen.findByRole('status')).toHaveTextContent(/password has been updated/i);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('shows "invalid or expired" on a 400', async () => {
    mockConfirm.mockImplementationOnce(() =>
      Promise.reject(new ApiError('Invalid or expired reset token', 400)),
    );
    const user = userEvent.setup();
    renderPage('/reset/confirm?token=stale');

    await user.type(screen.getByLabelText(/new password/i), 'brand-new-pass');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
  });

  it('rejects a short password client-side', async () => {
    const user = userEvent.setup();
    renderPage('/reset/confirm?token=tok');

    await user.type(screen.getByLabelText(/new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('requires a token', async () => {
    const user = userEvent.setup();
    renderPage('/reset/confirm'); // no token in the URL

    await user.type(screen.getByLabelText(/new password/i), 'brand-new-pass');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/paste your reset token/i);
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
