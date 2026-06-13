import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordInput from '../components/PasswordInput';

function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" value={value} onChange={setValue} />
    </>
  );
}

describe('PasswordInput', () => {
  it('masks the value by default', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
  });

  it('reveals and re-masks via the toggle, flipping the aria-label', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('the toggle is type=button so it never submits a form', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /show password/i })).toHaveAttribute(
      'type',
      'button',
    );
  });
});
