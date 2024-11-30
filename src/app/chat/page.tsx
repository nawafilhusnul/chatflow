"use client";

import { useEffect, useState, useRef } from "react";
import ProtectedRoute from "@/presentation/components/ProtectedRoute";
import Navigation from "@/presentation/components/Navigation";
import QRScanner from "@/presentation/components/QRScanner";
import { useAuth } from "@/presentation/hooks/useAuth";
import {
  chatService,
  ChatRoom,
  Message,
} from "@/infrastructure/services/chat.service";
import {
  userService,
  UserProfile,
} from "@/infrastructure/services/user.service";
import Image from "next/image";

export default function Chat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!user) return;

    let unsubscribeRooms: (() => void) | undefined;

    const loadChatRooms = async () => {
      try {
        unsubscribeRooms = await chatService.getChatRooms(user.uid, (rooms) => {
          setChatRooms(rooms);
        });
      } catch (error) {
        console.error("Error loading chat rooms:", error);
        setError("Failed to load chat rooms");
      }
    };

    loadChatRooms();

    return () => {
      if (unsubscribeRooms) {
        unsubscribeRooms();
      }
    };
  }, [user]);

  useEffect(() => {
    if (!selectedRoom || !user) return;

    let unsubscribeMessages: (() => void) | undefined;
    let unsubscribeRoom: (() => void) | undefined;

    const setupRealTimeUpdates = async () => {
      try {
        // Mark this user as active in the room
        await chatService.updateUserPresence(selectedRoom.id, user.uid, true);
        
        // Set up real-time listener for messages
        unsubscribeMessages = await chatService.getMessages(selectedRoom.id, async (messages) => {
          // If there are new messages and we're viewing the chat, mark them as read
          const unreadMessages = messages.filter(msg => !msg.readBy?.[user.uid]);
          if (unreadMessages.length > 0) {
            await chatService.markMessagesAsRead(selectedRoom.id, user.uid);
          }
          setMessages(messages);
          setError(null);
        });

        // Set up real-time listener for the chat room
        unsubscribeRoom = await chatService.listenToChatRoom(selectedRoom.id, (updatedRoom) => {
          if (updatedRoom) {
            setSelectedRoom(updatedRoom);
          }
        });
      } catch (error) {
        console.error("Error setting up real-time updates:", error);
        setError("Failed to load messages");
      }
    };

    setupRealTimeUpdates();

    // Cleanup subscriptions when component unmounts or selected room changes
    return () => {
      // Mark user as inactive in the room
      if (user && selectedRoom) {
        chatService.updateUserPresence(selectedRoom.id, user.uid, false)
          .catch(error => console.error("Error updating presence:", error));
      }
      
      if (unsubscribeMessages) {
        unsubscribeMessages();
      }
      if (unsubscribeRoom) {
        unsubscribeRoom();
      }
    };
  }, [selectedRoom?.id, user?.uid]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom || !user || !message.trim()) return;

    try {
      setMessage("");
      await chatService.sendMessage(selectedRoom.id, user.uid, message);
      // Scroll to bottom after sending message
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setError("Failed to send message");
    }
  };

  const handleQRScan = async (scannedUserId: string) => {
    try {
      const scannedUser = await userService.getUserByQRCode(scannedUserId);
      if (user && scannedUser) {
        const chatRoom = await chatService.createPrivateChat(
          user.uid,
          scannedUser.id
        );
        setSelectedRoom(chatRoom);
        setShowQRScanner(false);
      }
    } catch (error) {
      console.error("Error processing QR code:", error);
      setError("Failed to process QR code");
    }
  };

  const handleCreateGroup = async () => {
    if (!user || !groupName.trim() || selectedUsers.length === 0) return;

    try {
      const chatRoom = await chatService.createGroupChat(
        groupName.trim(),
        user.uid,
        selectedUsers
      );
      setChatRooms([...chatRooms, chatRoom]);
      setSelectedRoom(chatRoom);
      setShowNewGroup(false);
      setGroupName("");
      setSelectedUsers([]);
    } catch (error) {
      console.error("Error creating group:", error);
      setError("Failed to create group");
    }
  };

  const handleSearchUser = async () => {
    if (!searchEmail.trim()) return;

    try {
      const users = await userService.searchUsers(searchEmail.trim());
      setSearchResults(users.filter((u) => u.id !== user?.uid));
      setError(null);
    } catch (error) {
      console.error("Error searching users:", error);
      setError("Failed to search users");
    }
  };

  const handleRoomSelect = async (room: ChatRoom) => {
    if (!user) return;
    
    setSelectedRoom(room);
    
    try {
      await chatService.markMessagesAsRead(room.id, user.uid);
      await chatService.updateUserPresence(room.id, user.uid, true);
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date);
  };

  const renderMessageStatus = (message: Message) => {
    if (!user) return null;

    const isOwnMessage = message.senderId === user.uid;
    if (!isOwnMessage) return null;

    const readByOthers = Object.entries(message.readBy || {})
      .filter(([userId]) => userId !== user.uid)
      .some(([, isRead]) => isRead);

    return (
      <div className="flex items-center ml-2">
        <span className="text-xs text-gray-500 mr-1">
          {readByOthers ? "Read" : "Sent"}
        </span>
        {readByOthers ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 text-blue-500"
          >
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 text-gray-400"
          >
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
        )}
      </div>
    );
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-gray-100">
        {/* Chat list */}
        <div className="w-1/3 bg-white border-r">
          <div className="p-4 border-b">
            <h1 className="text-xl font-semibold">Chats</h1>
            <div className="mt-4 space-x-2">
              <button
                onClick={() => setShowQRScanner(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                Scan QR
              </button>
              <button
                onClick={() => setShowNewGroup(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                New Group
              </button>
            </div>
          </div>

          <div className="overflow-y-auto h-[calc(100vh-6rem)]">
            {chatRooms.map((room) => (
              <div
                key={room.id}
                onClick={() => handleRoomSelect(room)}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                  selectedRoom?.id === room.id ? "bg-indigo-50" : ""
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="font-medium">
                    {room.type === "group"
                      ? room.name
                      : room.participants.find((id) => id !== user?.uid)}
                  </div>
                  {user && 
                   room.id !== selectedRoom?.id && 
                   room.unreadCount?.[user.uid] > 0 && (
                    <span className="bg-indigo-600 text-white text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {room.unreadCount[user.uid]}
                    </span>
                  )}
                </div>
                {room.lastMessage && (
                  <div className="text-sm text-gray-500 mt-1">
                    <span className="mr-2">{room.lastMessage.text}</span>
                    <span className="text-xs">
                      {formatTime(room.lastMessage.timestamp)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chat messages */}
        {selectedRoom ? (
          <div className="flex-1 flex flex-col">
            {/* Chat header */}
            <div className="bg-white border-b p-4">
              <h2 className="text-lg font-medium">
                {selectedRoom.type === "group"
                  ? selectedRoom.name
                  : selectedRoom.participants.find(
                      (id) => id !== user?.uid
                    )}
              </h2>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">
                  {error}
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.senderId === user?.uid
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      msg.senderId === user?.uid
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-gray-900"
                    }`}
                  >
                    <div className="break-words">{msg.text}</div>
                    <div className="text-xs mt-1 flex items-center justify-end">
                      {formatTime(msg.timestamp)}
                      {renderMessageStatus(msg)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <div className="bg-white border-t p-4">
              <form onSubmit={handleSendMessage} className="flex gap-4">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!message.trim()}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <p className="text-gray-500">Select a chat to start messaging</p>
          </div>
        )}
      </div>

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Scan QR Code</h3>
              <button
                onClick={() => setShowQRScanner(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <QRScanner
              onScan={handleQRScan}
              onError={(error) => setError(error)}
            />
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Create New Group</h3>
              <button
                onClick={() => setShowNewGroup(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                className="w-full rounded-lg border-gray-300"
              />

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Search users
                </label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <input
                    type="text"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Search by email, username, or ID"
                  />
                  <button
                    type="button"
                    onClick={handleSearchUser}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Search
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Find users by their email, username, or ID
                </p>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700">
                    Search Results
                  </h3>
                  <div className="mt-2 space-y-2">
                    {searchResults.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {user.username || user.email.split("@")[0]}
                          </p>
                          <p className="text-xs text-gray-500">
                            {user.email}
                          </p>
                          {user.lastSeen && (
                            <p className="text-xs text-gray-400">
                              Last seen: {formatTime(user.lastSeen)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedUsers([...selectedUsers, user.id]);
                            setSearchEmail("");
                            setSearchResults([]);
                          }}
                          className="ml-2 inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedUsers.length === 0}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
