import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification as firebaseSendEmailVerification,
  sendPasswordResetEmail,
  User
} from 'firebase/auth';
import { auth } from '@/core/config/firebase';
import { IAuthService } from '@/core/interfaces/auth.interface';
import { userService } from './user.service';

class AuthService implements IAuthService {
  async register(email: string, password: string, username?: string): Promise<void> {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Create user profile
    if (userCredential.user) {
      await userService.upsertProfile(userCredential.user.uid, {
        email,
        username
      });
      await this.sendEmailVerification(userCredential.user);
    }
  }

  async login(email: string, password: string): Promise<void> {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Update last seen
    if (userCredential.user) {
      await userService.updateLastSeen(userCredential.user.uid);
    }
  }

  async logout(): Promise<void> {
    const user = auth.currentUser;
    if (user) {
      await userService.updateLastSeen(user.uid);
    }
    await signOut(auth);
  }

  getCurrentUser(): Promise<User | null> {
    return new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          unsubscribe();
          resolve(user);
        },
        reject
      );
    });
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  }

  async sendEmailVerification(user: User): Promise<void> {
    await firebaseSendEmailVerification(user);
  }
}

export const authService = new AuthService();
