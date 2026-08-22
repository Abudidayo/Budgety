import type { User } from '@auth0/auth0-react';

export function getDisplayName(user?: User): string {
  const givenName = user?.given_name?.trim();
  const fullName = user?.name?.trim();
  const nickname = user?.nickname?.trim();

  if (fullName && !fullName.includes('@')) return fullName;
  if (givenName) return givenName;
  return nickname || 'Budgety user';
}

export function getFirstName(user?: User): string {
  return user?.given_name?.trim() || getDisplayName(user).split(/\s+/)[0];
}
