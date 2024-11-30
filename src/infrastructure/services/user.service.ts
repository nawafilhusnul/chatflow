import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/core/config/firebase";
import QRCode from "qrcode";
import { IUserService, UserProfile } from "@/core/interfaces/user.interface";

class UserService implements IUserService {
  // Create or update user profile
  async upsertProfile(
    userId: string,
    data: Partial<UserProfile>
  ): Promise<UserProfile> {
    const userRef = doc(db, "users", userId);
    const qrCode = await this.generateQRCode(userId);

    // Generate username from email if not provided
    let username = data.username;
    if (!username && data.email) {
      username = data.email.split("@")[0];
      // Check if username exists
      let counter = 0;
      let tempUsername = username;
      while (await this.isUsernameTaken(tempUsername)) {
        counter++;
        tempUsername = `${username}${counter}`;
      }
      username = tempUsername;
    }

    // Prepare user data, removing undefined values
    const userData: Partial<UserProfile> = {
      id: userId,
      email: data.email,
      username: username,
      qrCode: qrCode,
      lastSeen: new Date(),
      // Only include optional fields if they are defined and not null
      ...(data.displayName && { displayName: data.displayName }),
      ...(data.photoURL && { photoURL: data.photoURL }),
      ...(data.status && { status: data.status }),
    };

    // Remove any undefined or null values
    Object.keys(userData).forEach((key) => {
      if (
        userData[key as keyof UserProfile] === undefined ||
        userData[key as keyof UserProfile] === null
      ) {
        delete userData[key as keyof UserProfile];
      }
    });

    await setDoc(userRef, userData, { merge: true });
    return userData as UserProfile;
  }

  // Check if username is taken
  async isUsernameTaken(username: string): Promise<boolean> {
    const q = query(collection(db, "users"), where("username", "==", username));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  }

  // Get user profile by ID
  async getUserProfile(userId: string): Promise<UserProfile> {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error("User not found");
    }

    return userDoc.data() as UserProfile;
  }

  // Search users by email, username, or ID
  async searchUsers(searchQuery: string): Promise<UserProfile[]> {
    searchQuery = searchQuery.trim().toLowerCase();

    // If empty query, return empty result
    if (!searchQuery) return [];

    // If query looks like an email
    if (searchQuery.includes("@")) {
      const emailQuery = query(
        collection(db, "users"),
        where("email", "==", searchQuery)
      );
      const snapshot = await getDocs(emailQuery);
      return snapshot.docs.map((doc) => doc.data() as UserProfile);
    }

    // Try to find by username (case insensitive)
    const usernameQuery = query(
      collection(db, "users"),
      where("username", ">=", searchQuery),
      where("username", "<=", searchQuery + "\uf8ff")
    );
    const usernameSnapshot = await getDocs(usernameQuery);
    const usernameResults = usernameSnapshot.docs.map(
      (doc) => doc.data() as UserProfile
    );

    // If we found results by username, return them
    if (usernameResults.length > 0) {
      return usernameResults;
    }

    // Try to find by ID
    try {
      const user = await this.getUserProfile(searchQuery);
      return [user];
    } catch (error) {
      return [];
    }
  }

  // Update user profile
  async updateProfile(
    userId: string,
    data: Partial<UserProfile>
  ): Promise<void> {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, data);
  }

  // Update user's last seen
  async updateLastSeen(userId: string): Promise<void> {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      lastSeen: new Date(),
    });
  }

  // Generate QR code for user ID
  private async generateQRCode(userId: string): Promise<string> {
    try {
      // Generate QR code with user ID
      const qrCode = await QRCode.toDataURL(userId);
      return qrCode;
    } catch (err) {
      console.error("Error generating QR code:", err);
      throw err;
    }
  }

  // Get user by scanning QR code (the QR code contains the user ID)
  async getUserByQRCode(scannedUserId: string): Promise<UserProfile> {
    return this.getUserProfile(scannedUserId);
  }
}

export const userService = new UserService();
