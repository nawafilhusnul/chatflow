export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  displayName?: string;
  photoURL?: string;
  status?: string;
  qrCode?: string;
  lastSeen?: Date;
}

export interface IUserService {
  upsertProfile(userId: string, data: Partial<UserProfile>): Promise<UserProfile>;
  getUserProfile(userId: string): Promise<UserProfile>;
  searchUsers(query: string): Promise<UserProfile[]>;
  updateProfile(userId: string, data: Partial<UserProfile>): Promise<void>;
  getUserByQRCode(scannedUserId: string): Promise<UserProfile>;
  updateLastSeen(userId: string): Promise<void>;
  isUsernameTaken(username: string): Promise<boolean>;
}
