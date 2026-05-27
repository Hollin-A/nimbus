import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeveritySelect from '../components/SeveritySelect';

describe('SeveritySelect', () => {
  it('renders Info, Warning, and Alert as radio options', () => {
    render(<SeveritySelect value="info" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Info' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Warning' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Alert' })).toBeInTheDocument();
  });

  it('marks only the active value as aria-checked', () => {
    render(<SeveritySelect value="warning" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Info' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Warning' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Alert' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('fires onChange with the clicked severity value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SeveritySelect value="info" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Alert' }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('alert');
  });

  it('uses role="radiogroup" with an accessible label', () => {
    render(<SeveritySelect value="info" onChange={() => {}} />);
    expect(
      screen.getByRole('radiogroup', { name: /severity/i }),
    ).toBeInTheDocument();
  });
});
