import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PasswordResetRequestPage from '../pages/PasswordResetRequestPage';
import { ApiError } from '../api/client';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('../api/client', async (importActual) => {
  const actual = await importActual<typeof import('../api/client')>();
  return { ...actual, requestPasswordReset: mockRequest };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset']}>
      <PasswordResetRequestPage />
    </MemoryRouter>,
  );
}

describe('PasswordResetRequestPage', () => {
  beforeEach(() => mockRequest.mockReset());

  it('calls the API with the trimmed username', async () => {
    mockRequest.mockResolvedValue({ token: 'tok', expiresAt: 'soon', note: 'demo note' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/username/i), '  admin  ');
    await user.click(screen.getByRole('button', { name: /request reset token/i }));

    expect(mockRequest).toHaveBeenCalledWith('admin');
  });

  it('reveals the token and the trade-off note on success', async () => {
    mockRequest.mockResolvedValue({
      token: 'reveal-me-123',
      expiresAt: 'soon',
      note: 'This token would normally be emailed.',
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.click(screen.getByRole('button', { name: /request reset token/i }));

    expect(await screen.findByText('reveal-me-123')).toBeInTheDocument();
    // The trade-off explanation is surfaced (role="note").
    expect(screen.getByRole('note')).toHaveTextContent(/normally be emailed/i);
    expect(screen.getByRole('note')).toHaveTextContent(/trade-off/i);
    // And a link carries the token to the confirm step.
    const cont = screen.getByRole('link', { name: /set a new password/i });
    expect(cont).toHaveAttribute('href', expect.stringContaining('reveal-me-123'));
  });

  it('shows "no account" on a 404', async () => {
    mockRequest.mockImplementationOnce(() =>
      Promise.reject(new ApiError('No account with that username', 404)),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/username/i), 'ghost');
    await user.click(screen.getByRole('button', { name: /request reset token/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no account/i);
  });

  it('validates an empty username client-side', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /request reset token/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your username/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('shows a generic reach-error on a non-ApiError rejection', async () => {
    mockRequest.mockImplementationOnce(() => Promise.reject(new Error('network down')));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.click(screen.getByRole('button', { name: /request reset token/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });
});
