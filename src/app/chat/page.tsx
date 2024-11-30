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
import Link from "next/link";

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
  const [participantNames, setParticipantNames] = useState<{
    [key: string]: string;
  }>({});
  const [showRoomDetails, setShowRoomDetails] = useState(false);
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
        // Check for room parameter in URL first
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get("room");

        unsubscribeRooms = await chatService.getChatRooms(user.uid, (rooms) => {
          setChatRooms(rooms);

          // If we have a roomId in URL and haven't selected a room yet
          if (roomId && !selectedRoom) {
            const room = rooms.find((r) => r.id === roomId);
            if (room) {
              setSelectedRoom(room);
            }
          }
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
  }, [user, selectedRoom]);

  useEffect(() => {
    const loadParticipantNames = async () => {
      if (!chatRooms.length) return;

      const names: { [key: string]: string } = {};
      for (const room of chatRooms) {
        for (const participantId of room.participants) {
          if (participantId !== user?.uid && !names[participantId]) {
            try {
              const profile = await userService.getUserProfile(participantId);
              names[participantId] =
                profile.displayName || profile.email || "Unknown User";
            } catch (error) {
              console.error("Error loading participant name:", error);
              names[participantId] = "Unknown User";
            }
          }
        }
      }
      setParticipantNames(names);
    };

    loadParticipantNames();
  }, [chatRooms, user?.uid]);

  useEffect(() => {
    if (!selectedRoom || !user) return;

    let unsubscribeMessages: (() => void) | undefined;
    let unsubscribeRoom: (() => void) | undefined;

    const setupRealTimeUpdates = async () => {
      try {
        // Mark this user as active in the room
        await chatService.updateUserPresence(selectedRoom.id, user.uid, true);

        // Set up real-time listener for messages
        unsubscribeMessages = await chatService.getMessages(
          selectedRoom.id,
          async (messages) => {
            // If there are new messages and we're viewing the chat, mark them as read
            const unreadMessages = messages.filter(
              (msg) => !msg.readBy?.[user.uid]
            );
            if (unreadMessages.length > 0) {
              await chatService.markMessagesAsRead(selectedRoom.id, user.uid);
            }
            setMessages(messages);
            setError(null);
          }
        );

        // Set up real-time listener for the chat room
        unsubscribeRoom = await chatService.listenToChatRoom(
          selectedRoom.id,
          (updatedRoom) => {
            if (updatedRoom) {
              setSelectedRoom(updatedRoom);
            }
          }
        );
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
        chatService
          .updateUserPresence(selectedRoom.id, user.uid, false)
          .catch((error) => console.error("Error updating presence:", error));
      }

      if (unsubscribeMessages) {
        unsubscribeMessages();
      }
      if (unsubscribeRoom) {
        unsubscribeRoom();
      }
    };
  }, [selectedRoom?.id, user?.uid]);

  const getParticipantName = (room: ChatRoom) => {
    if (room.type === "group") return room.name || "Unnamed Group";
    const otherParticipantId = room.participants.find((id) => id !== user?.uid);
    return otherParticipantId
      ? participantNames[otherParticipantId]
      : "Unknown User";
  };

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

  const removeParticipant = async (participantId: string) => {
    try {
      await chatService.removeParticipant(selectedRoom.id, participantId);
    } catch (error) {
      console.error("Error removing participant:", error);
    }
  };

  return (
    <ProtectedRoute>
      <div className="chat-container">
        {/* Chat list */}
        <div className="chat-sidebar">
          <div className="flex justify-between items-center p-4 border-b">
            <h1 className="text-2xl font-bold">Chats</h1>
            <div className="flex gap-2">
              <Link
                href="/profile"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                Profile
              </Link>
              <Link
                href="/friends"
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
              >
                Friends
              </Link>
              <button
                onClick={() => setShowNewGroup(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                New Group
              </button>
            </div>
          </div>

          <div className="overflow-y-auto">
            {chatRooms.length > 0 ? (
              chatRooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => handleRoomSelect(room)}
                  className={`chat-room-item ${
                    selectedRoom?.id === room.id ? "chat-room-item-active" : ""
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="avatar">
                      {getParticipantName(room)?.charAt(0)?.toUpperCase() ||
                        "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          {getParticipantName(room)}
                        </h3>
                        {room.lastMessage && (
                          <span className="text-xs text-gray-500">
                            {formatTime(room.lastMessage.timestamp)}
                          </span>
                        )}
                      </div>
                      {room.lastMessage && (
                        <p className="text-sm text-gray-500 truncate">
                          {room.lastMessage.text}
                        </p>
                      )}
                    </div>
                    {user &&
                      room.id !== selectedRoom?.id &&
                      room.unreadCount?.[user.uid] > 0 && (
                        <span className="badge">
                          {room.unreadCount[user.uid]}
                        </span>
                      )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-12 w-12 mx-auto mb-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <p className="text-lg font-medium mb-2">No messages yet</p>
                <p className="text-sm">
                  Start a new chat from the Friends page!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Chat messages */}
        <div className="chat-main">
          {selectedRoom ? (
            <>
              <div className="chat-header">
                <div className="flex items-center justify-between p-4 border-b">
                  <div className="flex items-center space-x-3">
                    <div className="avatar">
                      {getParticipantName(selectedRoom)
                        ?.charAt(0)
                        ?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">
                        {getParticipantName(selectedRoom)}
                      </h2>
                      <p className="text-sm text-gray-500">
                        {selectedRoom.isGroup
                          ? `${
                              Object.keys(selectedRoom.participants || {})
                                .length
                            } members`
                          : selectedRoom.activeUsers?.[user?.uid || ""]
                          ? "Active now"
                          : "Offline"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRoomDetails(true)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="chat-messages">
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
                      className={`message-bubble ${
                        msg.senderId === user?.uid
                          ? "message-bubble-sent"
                          : "message-bubble-received"
                      }`}
                    >
                      <p>{msg.text}</p>
                      <div className="flex items-center justify-end mt-1 space-x-1">
                        <span className="text-xs opacity-75">
                          {formatTime(msg.timestamp)}
                        </span>
                        {msg.senderId === user?.uid && renderMessageStatus(msg)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input">
                <form onSubmit={handleSendMessage} className="flex space-x-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="input-primary"
                  />
                  <button type="submit" className="btn-primary">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 mx-auto mb-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Select a chat to start messaging
                </h3>
                <p className="text-sm text-gray-500">
                  Choose from your existing conversations or start a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Scan QR Code</h2>
              <button
                onClick={() => setShowQRScanner(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <QRScanner onScan={handleQRScan} />
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Create New Group</h2>
              <button
                onClick={() => setShowNewGroup(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="groupName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Group Name
                </label>
                <input
                  type="text"
                  id="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="input-primary"
                  placeholder="Enter group name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add Members
                </label>
                <div className="flex space-x-2 mb-2">
                  <input
                    type="text"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    className="input-primary"
                    placeholder="Search by email"
                  />
                  <button onClick={handleSearchUser} className="btn-secondary">
                    Search
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {user.username || user.email.split("@")[0]}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                      <button
                        onClick={() => {
                          if (selectedUsers.includes(user.id)) {
                            setSelectedUsers(
                              selectedUsers.filter((id) => id !== user.id)
                            );
                          } else {
                            setSelectedUsers([...selectedUsers, user.id]);
                          }
                        }}
                        className={`btn-secondary ${
                          selectedUsers.includes(user.id)
                            ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                            : ""
                        }`}
                      >
                        {selectedUsers.includes(user.id)
                          ? "Selected"
                          : "Select"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end space-x-2 mt-4">
                <button
                  onClick={() => setShowNewGroup(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedUsers.length === 0}
                  className={`btn-primary ${
                    !groupName.trim() || selectedUsers.length === 0
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  Create Group
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Room Details Modal */}
      {showRoomDetails && selectedRoom && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">
                {selectedRoom.isGroup ? "Group Details" : "Chat Details"}
              </h3>
              <button
                onClick={() => setShowRoomDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {selectedRoom.isGroup ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Group Name
                  </label>
                  <p className="mt-1">{selectedRoom.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Members
                  </label>
                  <div className="mt-1 space-y-2">
                    {Object.keys(selectedRoom.participants || {}).map(
                      (participantId) => (
                        <div
                          key={participantId}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                              {selectedRoom.participants[
                                participantId
                              ]?.displayName
                                ?.charAt(0)
                                ?.toUpperCase() || "?"}
                            </div>
                            <span>
                              {
                                selectedRoom.participants[participantId]
                                  ?.displayName
                              }
                            </span>
                          </div>
                          {selectedRoom.adminId === user?.uid &&
                            participantId !== user?.uid && (
                              <button
                                onClick={() => removeParticipant(participantId)}
                                className="text-red-600 hover:text-red-700 text-sm"
                              >
                                Remove
                              </button>
                            )}
                        </div>
                      )
                    )}
                  </div>
                </div>
                {selectedRoom.adminId === user?.uid && (
                  <div className="pt-4 flex justify-end">
                    <button
                      onClick={() => setShowNewGroup(true)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      Edit Group
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xl">
                    {getParticipantName(selectedRoom)
                      ?.charAt(0)
                      ?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {getParticipantName(selectedRoom)}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {selectedRoom.activeUsers?.[user?.uid || ""]
                        ? "Active now"
                        : "Offline"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
