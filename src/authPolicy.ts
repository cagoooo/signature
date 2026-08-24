import type { User } from 'firebase/auth';

export const ADMIN_EMAIL = 'ipad@mail2.smes.tyc.edu.tw';

export const isAllowedAdminEmail = (email?: string | null): boolean =>
    Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);

export const isAllowedAdminUser = (user: User | null): boolean =>
    Boolean(user && isAllowedAdminEmail(user.email));
