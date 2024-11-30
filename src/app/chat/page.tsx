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
import toast from "react-hot-toast";

export default function Chat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedUsersInfo, setSelectedUsersInfo] = useState<UserProfile[]>([]);
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

          // Set online status for all rooms
          rooms.forEach(async (room) => {
            await chatService.updateUserPresence(room.id, user.uid, true);
          });

          // Only set selected room if none is selected or if we have a roomId in URL
          if ((!selectedRoom && roomId) || (roomId && selectedRoom?.id !== roomId)) {
            const room = rooms.find((r) => r.id === roomId);
            if (room) {
              setSelectedRoom(room);
            }
          } else if (selectedRoom) {
            // Update the selected room data if it exists in the new rooms list
            const updatedRoom = rooms.find((r) => r.id === selectedRoom.id);
            if (updatedRoom) {
              setSelectedRoom(updatedRoom);
            }
          }
        });
      } catch (error) {
        console.error("Error loading chat rooms:", error);
        setError("Failed to load chat rooms");
      }
    };

    loadChatRooms();

    // Cleanup function to set user as offline when leaving
    return () => {
      if (unsubscribeRooms) {
        unsubscribeRooms();
      }
      // Set offline status for all rooms
      chatRooms.forEach(async (room) => {
        await chatService.updateUserPresence(room.id, user.uid, false);
      });
    };
  }, [user]);

  // Handle window/tab close or navigation
  useEffect(() => {
    if (!user) return;

    const handleBeforeUnload = () => {
      chatRooms.forEach((room) => {
        chatService.updateUserPresence(room.id, user.uid, false);
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [user, chatRooms]);

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

  const handleRoomSelect = async (room: ChatRoom) => {
    setSelectedRoom(room);
    try {
      // Subscribe to messages
      const unsubscribe = await chatService.getMessages(
        room.id,
        (newMessages) => {
          setMessages(newMessages);
        }
      );

      // Mark messages as read
      if (user) {
        await chatService.markMessagesAsRead(room.id, user.uid);
        // Update user presence
        await chatService.updateUserPresence(room.id, user.uid, true);
      }

      return () => {
        if (user) {
          chatService.updateUserPresence(room.id, user.uid, false);
        }
        unsubscribe();
      };
    } catch (error) {
      console.error("Error loading messages:", error);
      setError("Failed to load messages");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedRoom || !user) return;

    try {
      await chatService.sendMessage(selectedRoom.id, user.uid, message.trim());
      setMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      setError("Failed to send message");
    }
  };

  const handleCreateGroup = async () => {
    if (!user || !groupName.trim() || selectedUsers.length === 0) return;

    try {
      await chatService.createGroupChat(
        groupName.trim(),
        user.uid,
        selectedUsers
      );
      setShowNewGroup(false);
      setGroupName("");
      setSelectedUsers([]);
      setSelectedUsersInfo([]);
      setSearchResults([]);
    } catch (error) {
      console.error("Error creating group:", error);
      setError("Failed to create group");
    }
  };

  const handleSearchUsers = async () => {
    if (!searchEmail.trim()) return;

    try {
      const results = await userService.searchUsers(searchEmail);
      // Filter out the current user and already selected users
      const filteredResults = results.filter(
        (result) =>
          result.uid !== user?.uid && !selectedUsers.includes(result.uid)
      );
      setSearchResults(filteredResults);
      
      if (filteredResults.length === 0) {
        toast.error('No users found. Please try with exact email or username.');
      } else {
        setError(null);
      }
    } catch (error) {
      console.error("Error searching users:", error);
      toast.error("Failed to search users");
    }
  };

  const handleAddUser = (user: UserProfile) => {
    if (!selectedUsers.includes(user.uid)) {
      setSelectedUsers([...selectedUsers, user.uid]);
      setSelectedUsersInfo([...selectedUsersInfo, user]);
    }
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter(id => id !== userId));
    setSelectedUsersInfo(selectedUsersInfo.filter(user => user.uid !== userId));
  };

  useEffect(() => {
    // Perform search when searchEmail changes
    const delayDebounce = setTimeout(() => {
      if (searchEmail) {
        handleSearchUsers();
      } else {
        setSearchResults([]);
      }
    }, 300); // 300ms delay

    return () => clearTimeout(delayDebounce);
  }, [searchEmail]);

  const handleQRScan = async (result: string) => {
    try {
      const scannedUserId = result;
      if (user && scannedUserId) {
        await chatService.createPrivateChat(user.uid, scannedUserId);
        setShowQRScanner(false);
      }
    } catch (error) {
      console.error("Error creating chat from QR:", error);
      setError("Failed to create chat from QR code");
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
      <div className="flex h-screen bg-gray-100">
        {/* Chat list sidebar */}
        <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Chats</h2>
              <div className="flex space-x-2">
                <Link
                  href="/friends"
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                  title="Add Friends"
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
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </Link>
                <button
                  onClick={() => setShowNewGroup(true)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                  title="Create New Group"
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
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setShowQRScanner(true)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                  title="Scan QR Code"
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
                      d="M12 4v1m6 11h2m-6 0h-2m0 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Chat rooms list */}
          <div className="flex-1 overflow-y-auto">
            {chatRooms.map((room) => (
              <div
                key={room.id}
                onClick={() => handleRoomSelect(room)}
                className={`flex items-center space-x-4 p-4 hover:bg-gray-50 cursor-pointer relative ${
                  selectedRoom?.id === room.id ? "bg-gray-50" : ""
                }`}
              >
                <div className="relative">
                  <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-medium">
                    {room.type === "group"
                      ? room.name?.[0]?.toUpperCase()
                      : participantNames[
                          room.participants.find((id) => id !== user?.uid) || ""
                        ]?.[0]?.toUpperCase() || "?"}
                  </div>
                  {/* Online status indicator */}
                  {room.activeUsers?.[
                    room.participants.find((id) => id !== user?.uid) || ""
                  ] && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {room.type === "group"
                        ? room.name
                        : participantNames[
                            room.participants.find((id) => id !== user?.uid) ||
                              ""
                          ] || "Unnamed Chat"}
                    </p>
                    {room.lastMessage && (
                      <span className="text-xs text-gray-500">
                        {new Date(
                          room.lastMessage.timestamp.seconds * 1000
                        ).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500 truncate">
                      {room.lastMessage?.text || "No messages yet"}
                    </p>
                    {/* Unread message count */}
                    {room.unreadCount?.[user?.uid || ""] > 0 && (
                      <div className="bg-indigo-600 text-white text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center">
                        {room.unreadCount[user?.uid || ""]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {selectedRoom ? (
            <>
              {/* Chat header */}
              <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-indigo-600 font-medium">
                      {selectedRoom.name?.[0]?.toUpperCase() ||
                        participantNames[
                          selectedRoom.participants.find(
                            (id) => id !== user?.uid
                          ) || ""
                        ]?.[0]?.toUpperCase() ||
                        "?"}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">
                      {selectedRoom.name || selectedRoom.type === "private"
                        ? participantNames[
                            selectedRoom.participants.find(
                              (id) => id !== user?.uid
                            ) || ""
                          ]
                        : "Unnamed Chat"}
                    </h2>
                    {selectedRoom.type === "group" && (
                      <p className="text-sm text-gray-500">
                        {selectedRoom.participants.length} members
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                  {messages.map((msg, index) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.senderId === user?.uid
                          ? "justify-end"
                          : "justify-start"
                      } mb-4`}
                    >
                      <div
                        className={`max-w-[70%] ${
                          msg.senderId === user?.uid
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-900"
                        } rounded-lg px-4 py-2 shadow-sm`}
                      >
                        {/* Sender name for group chats or others' messages */}
                        {(selectedRoom?.type === "group" ||
                          msg.senderId !== user?.uid) && (
                          <p
                            className={`text-xs mb-1 font-medium ${
                              msg.senderId === user?.uid
                                ? "text-indigo-100"
                                : "text-indigo-600"
                            }`}
                          >
                            {msg.senderId === user?.uid
                              ? "You"
                              : participantNames[msg.senderId] || "Unknown"}
                          </p>
                        )}
                        <p>{msg.text}</p>
                        <div className="flex items-center justify-end mt-1 space-x-1">
                          <span className="text-xs opacity-75">
                            {new Date(
                              msg.timestamp.seconds * 1000
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {msg.senderId === user?.uid && (
                            <span className="text-xs">
                              {Object.values(msg.readBy || {}).every(
                                (isRead) => isRead
                              ) ? (
                                // Read by everyone - double blue checkmark
                                <div className="flex text-blue-500">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    className="w-3 h-3 -mr-1"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    className="w-3 h-3"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </div>
                              ) : Object.values(msg.readBy || {}).some(
                                  (isRead) => isRead
                                ) ? (
                                // Read by at least one person - single blue checkmark
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className="w-3 h-3 text-blue-500"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              ) : (
                                // Sent but not read - single gray checkmark
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className="w-3 h-3 text-gray-400"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message input */}
                <div className="p-4 bg-white border-t border-gray-200">
                  <form onSubmit={handleSendMessage} className="flex space-x-2">
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                    <button
                      type="submit"
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-r from-indigo-400 to-purple-400 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-12 w-12 text-white"
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
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Welcome to NullVibes Chat
                </h3>
                <p className="text-gray-500">
                  Select a chat to start messaging
                </p>
              </div>
            </div>
          )}
        </div>

        {/* QR Scanner Modal */}
        {showQRScanner && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Scan QR Code</h3>
                <button
                  onClick={() => setShowQRScanner(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Create New Group</h3>
                <button
                  onClick={() => setShowNewGroup(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg
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
                    className="block text-sm font-medium text-gray-700"
                  >
                    Group Name
                  </label>
                  <input
                    type="text"
                    id="groupName"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="Enter group name"
                  />
                </div>

                <div>
                  <label
                    htmlFor="searchEmail"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Search Users by Email
                  </label>
                  <div className="mt-1 flex space-x-2">
                    <input
                      type="email"
                      id="searchEmail"
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Enter email to search"
                    />
                    <button
                      onClick={handleSearchUsers}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Search Results
                    </h4>
                    <div className="space-y-2">
                      {searchResults.map((user) => (
                        <div
                          key={user.uid}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-md"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm text-gray-900 font-medium">
                              {user.displayName || user.username}
                            </span>
                            <span className="text-xs text-gray-500">
                              {user.email}
                            </span>
                          </div>
                          <button
                            onClick={() => handleAddUser(user)}
                            className={`px-3 py-1 rounded-md text-sm ${
                              selectedUsers.includes(user.uid)
                                ? "bg-gray-200 text-gray-600"
                                : "bg-indigo-600 text-white hover:bg-indigo-700"
                            }`}
                            disabled={selectedUsers.includes(user.uid)}
                          >
                            {selectedUsers.includes(user.uid) ? "Added" : "Add"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Selected Users */}
                {selectedUsers.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Selected Users ({selectedUsers.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedUsersInfo.map((user) => (
                        <div
                          key={user.uid}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-md"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm text-gray-900 font-medium">
                              {user.displayName || user.username}
                            </span>
                            <span className="text-xs text-gray-500">
                              {user.email}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveUser(user.uid)}
                            className="px-2 py-1 text-sm text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6">
                  <button
                    onClick={handleCreateGroup}
                    disabled={!groupName.trim() || selectedUsers.length === 0}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Create Group
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
