import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
  arrayRemove,
  runTransaction,
  serverTimestamp,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/core/config/firebase";
import QRCode from "qrcode";
import { IUserService, UserProfile } from "@/core/interfaces/user.interface";

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  friends?: string[]; // Array of friend UIDs
  friendRequests?: {
    sent: string[]; // Array of sent friend request UIDs
    received: string[]; // Array of received friend request UIDs
  };
}

interface FriendRequest {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

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
  async getUserProfile(userId: string) {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        throw new Error("User not found");
      }
      return userDoc.data();
    } catch (error) {
      console.error("Error getting user profile:", error);
      throw error;
    }
  }

  // Search users by exact email or username match
  async searchUsers(searchQuery: string): Promise<UserProfile[]> {
    try {
      searchQuery = searchQuery.trim().toLowerCase();
      if (!searchQuery) return [];

      const usersRef = collection(db, "users");
      const results: UserProfile[] = [];

      // Search by exact email match
      const emailQuery = query(usersRef, where("email", "==", searchQuery));
      const emailSnapshot = await getDocs(emailQuery);
      emailSnapshot.docs.forEach((doc) => {
        results.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });

      // Search by exact username match
      const usernameQuery = query(
        usersRef,
        where("username", "==", searchQuery)
      );
      const usernameSnapshot = await getDocs(usernameQuery);
      usernameSnapshot.docs.forEach((doc) => {
        if (!results.find((u) => u.uid === doc.id)) {
          results.push({ uid: doc.id, ...doc.data() } as UserProfile);
        }
      });

      return results;
    } catch (error) {
      console.error("Error searching users:", error);
      return [];
    }
  }

  // Search user by email
  async searchUserByEmail(email: string): Promise<UserProfile | null> {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {
      uid: doc.id,
      ...doc.data(),
    } as UserProfile;
  }

  // Search user by username
  async searchUserByUsername(username: string): Promise<UserProfile | null> {
    const q = query(collection(db, "users"), where("username", "==", username));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {
      uid: doc.id,
      ...doc.data(),
    } as UserProfile;
  }

  // Update user profile
  async updateProfile(
    userId: string,
    data: {
      displayName?: string;
      username?: string;
      photoURL?: string;
    }
  ) {
    try {
      await updateDoc(doc(db, "users", userId), {
        ...data,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
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
  async getUserByQRCode(scannedUserId: string): Promise<UserProfile | null> {
    const userRef = doc(db, "users", scannedUserId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) return null;
    return {
      uid: userDoc.id,
      ...userDoc.data(),
    } as UserProfile;
  }

  async getFriends(userId: string): Promise<FriendRequest[]> {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) return [];

      const userData = userDoc.data();
      const friendIds = userData.friends || [];

      const friends = await Promise.all(
        friendIds.map(async (friendId: string) => {
          const friendDoc = await getDoc(doc(db, "users", friendId));
          if (!friendDoc.exists()) return null;
          const friendData = friendDoc.data();
          return {
            id: friendId,
            displayName: friendData.displayName,
            email: friendData.email,
            photoURL: friendData.photoURL,
          };
        })
      );

      return friends.filter(
        (friend): friend is FriendRequest => friend !== null
      );
    } catch (error) {
      console.error("Error getting friends:", error);
      throw error;
    }
  }

  async getFriendRequests(userId: string): Promise<{
    received: FriendRequest[];
    sent: FriendRequest[];
  }> {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        return { received: [], sent: [] };
      }

      const userData = userDoc.data();
      const receivedIds = userData.friendRequests?.received || [];
      const sentIds = userData.friendRequests?.sent || [];

      const [received, sent] = await Promise.all([
        Promise.all(
          receivedIds.map(async (senderId: string) => {
            const senderDoc = await getDoc(doc(db, "users", senderId));
            if (!senderDoc.exists()) return null;
            const senderData = senderDoc.data();
            return {
              id: senderId,
              displayName: senderData.displayName,
              email: senderData.email,
              photoURL: senderData.photoURL,
            };
          })
        ),
        Promise.all(
          sentIds.map(async (receiverId: string) => {
            const receiverDoc = await getDoc(doc(db, "users", receiverId));
            if (!receiverDoc.exists()) return null;
            const receiverData = receiverDoc.data();
            return {
              id: receiverId,
              displayName: receiverData.displayName,
              email: receiverData.email,
              photoURL: receiverData.photoURL,
            };
          })
        ),
      ]);

      return {
        received: received.filter((req): req is FriendRequest => req !== null),
        sent: sent.filter((req): req is FriendRequest => req !== null),
      };
    } catch (error) {
      console.error("Error getting friend requests:", error);
      throw error;
    }
  }

  async sendFriendRequest(senderId: string, receiverId: string) {
    try {
      const senderRef = doc(db, "users", senderId);
      const receiverRef = doc(db, "users", receiverId);

      const [senderDoc, receiverDoc] = await Promise.all([
        getDoc(senderRef),
        getDoc(receiverRef),
      ]);

      if (!senderDoc.exists() || !receiverDoc.exists()) {
        throw new Error("User not found");
      }

      const senderData = senderDoc.data();
      const receiverData = receiverDoc.data();

      // Initialize friend requests if they don't exist
      if (!senderData.friendRequests) {
        senderData.friendRequests = { sent: [], received: [] };
      }
      if (!receiverData.friendRequests) {
        receiverData.friendRequests = { sent: [], received: [] };
      }

      // Check if they are already friends
      const senderFriends = senderData.friends || [];
      const receiverFriends = receiverData.friends || [];

      if (
        senderFriends.includes(receiverId) ||
        receiverFriends.includes(senderId)
      ) {
        throw new Error("Already friends");
      }

      // Check if request already sent
      const senderSentRequests = senderData.friendRequests.sent || [];
      const receiverReceivedRequests =
        receiverData.friendRequests.received || [];

      if (
        senderSentRequests.includes(receiverId) ||
        receiverReceivedRequests.includes(senderId)
      ) {
        throw new Error("Friend request already sent");
      }

      // Update sender's document first
      await updateDoc(senderRef, {
        "friendRequests.sent": arrayUnion(receiverId),
      });

      // Then update receiver's document
      await updateDoc(receiverRef, {
        "friendRequests.received": arrayUnion(senderId),
      });
    } catch (error) {
      console.error("Error sending friend request:", error);
      throw error;
    }
  }

  async acceptFriendRequest(userId: string, friendId: string) {
    try {
      const userRef = doc(db, "users", userId);
      const friendRef = doc(db, "users", friendId);

      const [userDoc, friendDoc] = await Promise.all([
        getDoc(userRef),
        getDoc(friendRef),
      ]);

      if (!userDoc.exists() || !friendDoc.exists()) {
        throw new Error("User not found");
      }

      const userData = userDoc.data();
      const friendData = friendDoc.data();

      // Verify the friend request exists
      if (!userData.friendRequests?.received?.includes(friendId)) {
        throw new Error("Friend request not found");
      }

      // Update the user's document
      await updateDoc(userRef, {
        friendRequests: {
          sent: userData.friendRequests?.sent || [],
          received: (userData.friendRequests?.received || []).filter(
            (id) => id !== friendId
          ),
        },
        friends: [...(userData.friends || []), friendId],
      });

      // Update the friend's document
      await updateDoc(friendRef, {
        friendRequests: {
          sent: (friendData.friendRequests?.sent || []).filter(
            (id) => id !== userId
          ),
          received: friendData.friendRequests?.received || [],
        },
        friends: [...(friendData.friends || []), userId],
      });
    } catch (error) {
      console.error("Error accepting friend request:", error);
      throw error;
    }
  }

  async removeFriendRequest(
    userId: string,
    friendId: string,
    type: "sent" | "received"
  ) {
    try {
      const userRef = doc(db, "users", userId);
      const friendRef = doc(db, "users", friendId);

      const [userDoc, friendDoc] = await Promise.all([
        getDoc(userRef),
        getDoc(friendRef),
      ]);

      if (!userDoc.exists() || !friendDoc.exists()) {
        throw new Error("User not found");
      }

      const userData = userDoc.data();
      const friendData = friendDoc.data();

      if (type === "sent") {
        // Update user's sent requests
        await updateDoc(userRef, {
          friendRequests: {
            sent: (userData.friendRequests?.sent || []).filter(
              (id) => id !== friendId
            ),
            received: userData.friendRequests?.received || [],
          },
        });

        // Update friend's received requests
        await updateDoc(friendRef, {
          friendRequests: {
            sent: friendData.friendRequests?.sent || [],
            received: (friendData.friendRequests?.received || []).filter(
              (id) => id !== userId
            ),
          },
        });
      } else {
        // Update user's received requests
        await updateDoc(userRef, {
          friendRequests: {
            sent: userData.friendRequests?.sent || [],
            received: (userData.friendRequests?.received || []).filter(
              (id) => id !== friendId
            ),
          },
        });

        // Update friend's sent requests
        await updateDoc(friendRef, {
          friendRequests: {
            sent: (friendData.friendRequests?.sent || []).filter(
              (id) => id !== userId
            ),
            received: friendData.friendRequests?.received || [],
          },
        });
      }
    } catch (error) {
      console.error("Error removing friend request:", error);
      throw error;
    }
  }

  async removeFriend(userId: string, friendId: string) {
    try {
      const batch = writeBatch(db);

      // Remove from user's friends list
      const userRef = doc(db, "users", userId);
      batch.update(userRef, {
        friends: arrayRemove(friendId),
      });

      // Remove from friend's friends list
      const friendRef = doc(db, "users", friendId);
      batch.update(friendRef, {
        friends: arrayRemove(userId),
      });

      await batch.commit();
    } catch (error) {
      console.error("Error removing friend:", error);
      throw error;
    }
  }
}

export const userService = new UserService();
