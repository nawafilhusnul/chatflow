'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/presentation/hooks/useAuth';
import { userService } from '@/infrastructure/services/user.service';
import { chatService } from '@/infrastructure/services/chat.service';
import Image from 'next/image';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Toaster } from 'react-hot-toast';
import dynamic from 'next/dynamic';

const QRScanner = dynamic(() => import('@/presentation/components/QRScanner'), {
  ssr: false
});

interface FriendRequest {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

export default function FriendsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [friends, setFriends] = useState<FriendRequest[]>([]);
  const [requests, setRequests] = useState<{
    received: FriendRequest[];
    sent: FriendRequest[];
  }>({ received: [], sent: [] });
  const [searchType, setSearchType] = useState<'email' | 'username' | 'qr'>('email');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [myQRCode, setMyQRCode] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadFriendsAndRequests();
  }, [user]);

  useEffect(() => {
    const loadMyQRCode = async () => {
      if (user) {
        const qrCode = await userService.generateQRCode(user.uid);
        setMyQRCode(qrCode);
      }
    };
    loadMyQRCode();
  }, [user]);

  const loadFriendsAndRequests = async () => {
    if (!user) return;
    try {
      const [friendsList, requestsList] = await Promise.all([
        userService.getFriends(user.uid),
        userService.getFriendRequests(user.uid),
      ]);
      setFriends(friendsList);
      setRequests(requestsList);
    } catch (error) {
      console.error('Error loading friends:', error);
      setError('Failed to load friends');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !user) return;

    try {
      let result;
      if (searchType === 'email') {
        result = await userService.searchUserByEmail(searchQuery.trim());
      } else if (searchType === 'username') {
        result = await userService.searchUserByUsername(searchQuery.trim());
      }

      if (!result) {
        setSearchResult(null);
        setError('User not found');
        return;
      }

      if (result.uid === user.uid) {
        setError("You can't add yourself as a friend");
        return;
      }

      setSearchResult(result);
      setError(null);
    } catch (error) {
      console.error('Error searching user:', error);
      setError('Failed to search user');
    }
  };

  const handleQRScan = async (scannedData: string) => {
    if (!user) return;
    try {
      const scannedUser = await userService.getUserByQRCode(scannedData);
      if (scannedUser) {
        setSearchResult(scannedUser);
        setScanning(false);
      }
    } catch (error) {
      console.error('Error scanning QR code:', error);
      toast.error('Failed to scan QR code');
    }
  };

  const sendRequest = async (receiverId: string) => {
    if (!user) return;
    try {
      await userService.sendFriendRequest(user.uid, receiverId);
      loadFriendsAndRequests();
      setSearchResult(null);
      setSearchQuery('');
      toast.success('Friend request sent!');
    } catch (error) {
      console.error('Error sending request:', error);
      setError('Failed to send friend request');
    }
  };

  const acceptRequest = async (friendId: string) => {
    if (!user) return;
    try {
      await userService.acceptFriendRequest(user.uid, friendId);
      loadFriendsAndRequests();
    } catch (error) {
      console.error('Error accepting request:', error);
      setError('Failed to accept friend request');
    }
  };

  const rejectRequest = async (friendId: string) => {
    if (!user) return;
    try {
      await userService.removeFriendRequest(user.uid, friendId, "received");
      loadFriendsAndRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
      setError('Failed to reject friend request');
    }
  };

  const startChat = async (friendId: string) => {
    if (!user) return;
    try {
      const chat = await chatService.getOrCreateDirectChat(user.uid, friendId);
      router.push(`/chat?room=${chat.id}`);
    } catch (error) {
      console.error('Error starting chat:', error);
      setError('Failed to start chat');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Toaster position="top-center" />
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Friends</h2>
            <div className="flex space-x-2">
              <Link
                href="/chat"
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                title="Back to Chat"
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
                    d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z"
                  />
                </svg>
              </Link>
              <button
                onClick={() => setShowQRCode(!showQRCode)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                title="Show QR Code"
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
                    d="M12 4v1m6 11h2m-6 0h-2m0 0H8m13 0a9 9 0 0118 0 9 9 0 01-18 0z"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex space-x-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        {/* Friends List */}
        <div className="flex-1 overflow-y-auto">
          {/* Friend Requests */}
          {requests.received.length > 0 && (
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Friend Requests</h3>
              {requests.received.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                      <span className="text-indigo-600 font-medium">
                        {request.email[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{request.email}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => acceptRequest(request.id)}
                      className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => rejectRequest(request.id)}
                      className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Friends */}
          <div className="p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-3">Friends</h3>
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                onClick={() => startChat(friend.id)}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-indigo-600 font-medium">
                      {friend.email[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{friend.email}</p>
                  </div>
                </div>
                <button
                  className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-full hover:bg-indigo-700"
                >
                  Message
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Search Results */}
      <div className="flex-1 flex flex-col">
        {searchResult ? (
          <div className="p-8 max-w-md mx-auto">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-2xl text-indigo-600 font-medium">
                    {searchResult.email[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{searchResult.email}</h3>
                  {searchResult.username && (
                    <p className="text-sm text-gray-500">@{searchResult.username}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => sendRequest(searchResult.uid)}
                className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Send Friend Request
              </button>
            </div>
          </div>
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
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Search for Friends
              </h3>
              <p className="text-gray-500">
                Search by email to find and add new friends
              </p>
            </div>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQRCode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Your QR Code</h3>
              <button
                onClick={() => setShowQRCode(false)}
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
            {myQRCode && (
              <div className="flex justify-center">
                <img src={myQRCode} alt="QR Code" className="w-64 h-64" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {scanning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Scan QR Code</h3>
              <button
                onClick={() => setScanning(false)}
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
    </div>
  );
}
