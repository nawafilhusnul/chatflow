export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  fullName: string;
  displayName: string;
  phoneNumber: string;
  photoURL?: string;
  friends?: string[];
  friendRequests?: {
    sent: string[];
    received: string[];
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserService {
  upsertProfile(userId: string, data: Partial<UserProfile>): Promise<UserProfile>;
  getProfile(userId: string): Promise<UserProfile | null>;
  searchUsers(query: string): Promise<UserProfile[]>;
  sendFriendRequest(fromUserId: string, toUserId: string): Promise<void>;
  acceptFriendRequest(userId: string, friendId: string): Promise<void>;
  rejectFriendRequest(userId: string, friendId: string): Promise<void>;
  getFriendRequests(userId: string): Promise<UserProfile[]>;
  getFriends(userId: string): Promise<UserProfile[]>;
  removeFriend(userId: string, friendId: string): Promise<void>;
}
