import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileTabBar from '../components/MobileTabBar';

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MobileTabBar />
    </MemoryRouter>,
  );
}

describe('MobileTabBar', () => {
  it('renders Home and Broadcast tab links', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /broadcast/i }),
    ).toBeInTheDocument();
  });

  it('marks Home as active on /', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /home/i })).toHaveClass(
      'text-brand',
    );
    expect(screen.getByRole('link', { name: /broadcast/i })).not.toHaveClass(
      'text-brand',
    );
  });

  it('marks Broadcast as active on /broadcast', () => {
    renderAt('/broadcast');
    expect(screen.getByRole('link', { name: /broadcast/i })).toHaveClass(
      'text-brand',
    );
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveClass(
      'text-brand',
    );
  });

  it('exposes an aria-label so screen readers identify it as primary nav', () => {
    renderAt('/');
    expect(
      screen.getByRole('navigation', { name: /primary/i }),
    ).toBeInTheDocument();
  });
});
