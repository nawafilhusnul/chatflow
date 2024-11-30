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
      orderBy('createdAt', 'desc')
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

  // Send a message
  async sendMessage(chatId: string, senderId: string, text: string) {
    if (!chatId || !senderId || !text.trim()) {
      throw new Error('Chat ID, sender ID, and message text are required');
    }

    const chatRef = doc(db, 'chatRooms', chatId);
    const chatDoc = await getDoc(chatRef);
    
    if (!chatDoc.exists()) {
      throw new Error('Chat room not found');
    }

    const chatData = chatDoc.data() as ChatRoom;
    const readBy: { [key: string]: boolean } = {};
    const unreadCountUpdate: { [key: string]: number } = {};
    
    // Get active users in the room
    const activeUsers = chatData.activeUsers || {};
    
    // Initialize read status for all participants
    chatData.participants.forEach(participantId => {
      // Message is marked as read if user is active in the room or is the sender
      readBy[participantId] = activeUsers[participantId] === true || participantId === senderId;
      
      // Only increment unread count for inactive users who aren't the sender
      if (!readBy[participantId]) {
        unreadCountUpdate[`unreadCount.${participantId}`] = increment(1);
      } else {
        unreadCountUpdate[`unreadCount.${participantId}`] = 0;
      }
    });

    const message = {
      text: text.trim(),
      senderId,
      timestamp: Timestamp.now(),
      readBy
    };

    const batch = writeBatch(db);

    // Add message to messages subcollection
    const messageRef = doc(collection(db, 'chatRooms', chatId, 'messages'));
    batch.set(messageRef, message);

    // Update last message and unread counts in chat room
    batch.update(chatRef, {
      lastMessage: {
        text: message.text,
        timestamp: message.timestamp,
        senderId: message.senderId,
        readBy: message.readBy
      },
      ...unreadCountUpdate
    });

    try {
      await batch.commit();
      return {
        id: messageRef.id,
        ...message
      };
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

  // Mark messages as read
  async markMessagesAsRead(chatId: string, userId: string) {
    const chatRef = doc(db, 'chatRooms', chatId);
    const messagesRef = collection(db, 'chatRooms', chatId, 'messages');
    
    const batch = writeBatch(db);

    try {
      // Get all messages that are not read by this user
      const q = query(
        messagesRef,
        where(`readBy.${userId}`, '!=', true)
      );
      
      const unreadSnapshot = await getDocs(q);
      
      // Mark each message as read
      unreadSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          [`readBy.${userId}`]: true
        });
      });

      // Update the chat room
      batch.update(chatRef, {
        [`unreadCount.${userId}`]: 0,
        [`lastMessage.readBy.${userId}`]: true,
        [`activeUsers.${userId}`]: true
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
}

export const chatService = new ChatService();
