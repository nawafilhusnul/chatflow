import { User } from 'firebase/auth';

export interface AuthError {
  code: string;
  message: string;
}

export interface IAuthService {
  getCurrentUser(): Promise<User | null>;
  register(email: string, password: string, username?: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  sendEmailVerification(user: User): Promise<void>;
}

export interface IUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}
