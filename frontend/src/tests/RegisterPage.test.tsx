import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from '../pages/RegisterPage';
import { ApiError } from '../api/client';

const { mockLogin, mockRegister } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockRegister: vi.fn(),
}));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    status: 'anon' as const,
    login: mockLogin,
    logout: vi.fn(),
  }),
}));

// Keep ApiError real (the page does instanceof checks); mock only register.
vi.mock('../api/client', async (importActual) => {
  const actual = await importActual<typeof import('../api/client')>();
  return { ...actual, register: mockRegister };
});

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <RegisterPage />
    </MemoryRouter>,
  );
}

async function fillValid() {
  const user = userEvent.setup();
  renderRegister();
  await user.type(screen.getByLabelText(/username/i), 'newbie');
  await user.type(screen.getByLabelText(/display name/i), 'New Bie');
  await user.type(screen.getByLabelText(/password/i), 'password123');
  return user;
}

describe('RegisterPage', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockRegister.mockReset();
  });

  it('renders the username, display name, and password fields', () => {
    renderRegister();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('registers then logs the new user in on success', async () => {
    mockRegister.mockResolvedValue({ user: { id: '1', username: 'newbie', displayName: 'New Bie' } });
    mockLogin.mockResolvedValue(undefined);
    const user = await fillValid();

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(mockRegister).toHaveBeenCalledWith('newbie', 'password123', 'New Bie');
    expect(mockLogin).toHaveBeenCalledWith('newbie', 'password123');
  });

  it('validates an empty submit client-side without calling the API', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/fill in every field/i);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects a short password client-side', async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.type(screen.getByLabelText(/username/i), 'newbie');
    await user.type(screen.getByLabelText(/display name/i), 'New Bie');
    await user.type(screen.getByLabelText(/password/i), 'short');

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('shows "already taken" on a 409', async () => {
    mockRegister.mockRejectedValue(new ApiError('Username already taken', 409));
    const user = await fillValid();

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already taken/i);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows a generic reach-error on a non-ApiError rejection', async () => {
    mockRegister.mockRejectedValue(new Error('network down'));
    const user = await fillValid();

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });
});
