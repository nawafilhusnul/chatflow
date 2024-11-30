import {
  collection,
  query,
  where,
  orderBy,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  arrayUnion,
  Timestamp,
  onSnapshot,
  writeBatch,
  increment,
  setDoc,
  deleteField,
  serverTimestamp,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/core/config/firebase';

export interface ChatRoom {
  id: string;
  type: 'private' | 'group';
  name?: string;
  participants: string[];
  lastMessage?: {
    text: string;
    timestamp: Timestamp;
    senderId: string;
    readBy: { [userId: string]: boolean };
  };
  createdAt: Timestamp;
  groupAdmin?: string; // Only for group chats
  unreadCount?: { [userId: string]: number };
  activeUsers?: { [userId: string]: boolean };
  displayNames?: { [userId: string]: string }; // Custom display names for private chats
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp: Timestamp;
  readBy: { [userId: string]: boolean };
}

class ChatService {
  // Get all chat rooms for a user with real-time updates
  async getChatRooms(userId: string, onUpdate: (rooms: ChatRoom[]) => void): Promise<() => void> {
    if (!userId) throw new Error('User ID is required');

    const q = query(
      collection(db, 'chatRooms'),
      where('participants', 'array-contains', userId),
      orderBy('lastMessage.timestamp', 'desc')
    );

    try {
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const rooms = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as ChatRoom[];
          onUpdate(rooms);
        },
        (error) => {
          console.error('Error in chat rooms snapshot:', error);
          throw error;
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up chat rooms listener:', error);
      throw error;
    }
  }

  // Create a private chat room between two users
  async createPrivateChat(user1Id: string, user2Id: string) {
    // Check if chat already exists
    const existingChat = await this.findExistingPrivateChat(user1Id, user2Id);
    if (existingChat) return existingChat;

    const timestamp = Timestamp.now();
    const chatRoom = {
      type: 'private',
      participants: [user1Id, user2Id],
      createdAt: timestamp,
      lastMessage: {
        text: 'Chat created',
        timestamp: timestamp,
        senderId: user1Id,
        readBy: { [user1Id]: true, [user2Id]: false }
      },
      unreadCount: {
        [user1Id]: 0,
        [user2Id]: 1
      }
    };

    const docRef = await addDoc(collection(db, 'chatRooms'), chatRoom);
    return {
      id: docRef.id,
      ...chatRoom,
    };
  }

  // Create a group chat
  async createGroupChat(name: string, adminId: string, participantIds: string[]) {
    if (!name || name.trim().length === 0) {
      throw new Error('Group name is required');
    }

    const chatRoom = {
      type: 'group' as const,
      name: name.trim(),
      participants: [...new Set([adminId, ...participantIds])],
      groupAdmin: adminId,
      createdAt: Timestamp.now(),
      lastMessage: {
        text: 'Group created',
        timestamp: Timestamp.now(),
        senderId: adminId,
        readBy: { [adminId]: true },
      },
    };

    const docRef = await addDoc(collection(db, 'chatRooms'), chatRoom);
    return {
      id: docRef.id,
      ...chatRoom,
    };
  }

  // Add user to group chat
  async addUserToGroup(chatId: string, adminId: string, userId: string) {
    const chatRef = doc(db, 'chatRooms', chatId);
    const chatDoc = await getDoc(chatRef);
    
    if (!chatDoc.exists()) {
      throw new Error('Chat room not found');
    }

    const chatData = chatDoc.data() as ChatRoom;
    if (chatData.groupAdmin !== adminId) {
      throw new Error('Only group admin can add members');
    }

    if (chatData.participants.includes(userId)) {
      throw new Error('User is already in the group');
    }

    await updateDoc(chatRef, {
      participants: arrayUnion(userId),
    });
  }

  // Listen to a specific chat room for real-time updates
  async listenToChatRoom(chatId: string, onUpdate: (room: ChatRoom | null) => void): Promise<() => void> {
    const chatRef = doc(db, 'chatRooms', chatId);

    return onSnapshot(chatRef, (snapshot) => {
      if (snapshot.exists()) {
        const room = {
          id: snapshot.id,
          ...snapshot.data()
        } as ChatRoom;
        onUpdate(room);
      } else {
        onUpdate(null);
      }
    });
  }

  // Track user presence in a chat room
  async updateUserPresence(chatId: string, userId: string, isActive: boolean) {
    const chatRef = doc(db, 'chatRooms', chatId);
    
    try {
      await updateDoc(chatRef, {
        [`activeUsers.${userId}`]: isActive
      });
    } catch (error) {
      console.error('Error updating user presence:', error);
      throw error;
    }
  }

  // Send a message to a chat room
  async sendMessage(roomId: string, senderId: string, text: string) {
    try {
      const roomRef = doc(db, 'chatRooms', roomId);
      const roomDoc = await getDoc(roomRef);
      
      if (!roomDoc.exists()) {
        throw new Error('Chat room not found');
      }

      const room = roomDoc.data() as ChatRoom;
      const batch = writeBatch(db);
      const messageRef = doc(collection(db, 'chatRooms', roomId, 'messages'));
      
      // Initialize readBy object with all participants set to false except sender
      const readBy: { [key: string]: boolean } = {};
      room.participants.forEach(participantId => {
        readBy[participantId] = participantId === senderId;
      });

      const message = {
        text,
        senderId,
        timestamp: serverTimestamp(),
        readBy
      };

      // Add the message
      batch.set(messageRef, message);

      // Update last message and increment unread counter for all participants except sender
      const updateData: any = {
        lastMessage: {
          text,
          senderId,
          timestamp: serverTimestamp(),
          readBy
        }
      };

      // Increment unread counter for all participants except sender
      room.participants.forEach(participantId => {
        if (participantId !== senderId) {
          updateData[`unreadCount.${participantId}`] = increment(1);
        }
      });

      batch.update(roomRef, updateData);
      await batch.commit();

      return messageRef.id;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // Get messages for a chat room with real-time updates
  async getMessages(chatId: string, onUpdate: (messages: Message[]) => void): Promise<() => void> {
    if (!chatId) throw new Error('Chat ID is required');

    const q = query(
      collection(db, 'chatRooms', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    try {
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const messages = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Message[];
          onUpdate(messages);
        },
        (error) => {
          console.error('Error in messages snapshot:', error);
          throw error;
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up messages listener:', error);
      throw error;
    }
  }

  // Mark messages as read for a user
  async markMessagesAsRead(roomId: string, userId: string) {
    try {
      const roomRef = doc(db, 'chatRooms', roomId);
      const messagesRef = collection(db, 'chatRooms', roomId, 'messages');
      const batch = writeBatch(db);

      // Get all unread messages
      const q = query(
        messagesRef,
        where(`readBy.${userId}`, '==', false)
      );
      const snapshot = await getDocs(q);

      // Mark each message as read
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          [`readBy.${userId}`]: true
        });
      });

      // Reset unread counter for this user
      batch.update(roomRef, {
        [`unreadCount.${userId}`]: 0,
        [`lastMessage.readBy.${userId}`]: true
      });

      await batch.commit();
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw error;
    }
  }

  // Get unread count for a chat room
  async getUnreadCount(chatId: string, userId: string): Promise<number> {
    const chatDoc = await getDoc(doc(db, 'chatRooms', chatId));
    if (!chatDoc.exists()) return 0;

    const chatData = chatDoc.data() as ChatRoom;
    return chatData.unreadCount?.[userId] || 0;
  }

  // Find existing private chat between two users
  async findExistingPrivateChat(user1Id: string, user2Id: string): Promise<ChatRoom | null> {
    const q = query(
      collection(db, 'chatRooms'),
      where('type', '==', 'private'),
      where('participants', 'array-contains', user1Id)
    );

    const snapshot = await getDocs(q);
    const chat = snapshot.docs.find(doc => {
      const data = doc.data();
      return data.participants.includes(user2Id);
    });

    if (chat) {
      return {
        id: chat.id,
        ...chat.data()
      } as ChatRoom;
    }

    return null;
  }

  // Get or create a private chat between two users
  async getOrCreateDirectChat(user1Id: string, user2Id: string): Promise<ChatRoom> {
    // First try to find an existing chat
    const existingChat = await this.findExistingPrivateChat(user1Id, user2Id);
    if (existingChat) {
      return existingChat;
    }

    // If no existing chat is found, create a new one
    return this.createPrivateChat(user1Id, user2Id);
  }

  // Get all direct chats for a user
  async getDirectChats(userId: string): Promise<ChatRoom[]> {
    try {
      const chatsRef = collection(db, 'chatRooms');
      const q = query(
        chatsRef,
        where('type', '==', 'private'),
        where('participants', 'array-contains', userId)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as ChatRoom
      }));
    } catch (error) {
      console.error('Error getting direct chats:', error);
      throw error;
    }
  }

  // Remove participant from a group chat
  async removeParticipant(roomId: string, participantId: string) {
    try {
      const roomRef = doc(db, 'chatRooms', roomId);
      const roomDoc = await getDoc(roomRef);

      if (!roomDoc.exists()) {
        throw new Error('Chat room not found');
      }

      const room = roomDoc.data();
      if (!room.type === 'group') {
        throw new Error('Cannot remove participant from non-group chat');
      }

      // Remove participant from the room
      await updateDoc(roomRef, {
        participants: arrayRemove(participantId)
      });

    } catch (error) {
      console.error('Error removing participant:', error);
      throw error;
    }
  }

  // Update group details
  async updateGroupDetails(roomId: string, data: {
    name?: string;
    description?: string;
    photoURL?: string;
  }) {
    try {
      const roomRef = doc(db, 'chatRooms', roomId);
      await updateDoc(roomRef, {
        ...data,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating group details:', error);
      throw error;
    }
  }

  // Update display name for a private chat room
  async updateRoomDisplayName(roomId: string, userId: string, displayName: string) {
    if (!roomId || !userId) throw new Error('Room ID and User ID are required');
    
    const roomRef = doc(db, 'chatRooms', roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) throw new Error('Chat room not found');
    
    const room = roomDoc.data() as ChatRoom;
    if (room.type !== 'private') throw new Error('Display name can only be set for private chats');
    if (!room.participants.includes(userId)) throw new Error('User is not a participant of this chat');
    
    await updateDoc(roomRef, {
      [`displayNames.${userId}`]: displayName
    });
  }
}

export const chatService = new ChatService();
