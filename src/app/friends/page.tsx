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
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-center" />
      
      {/* Navigation Bar */}
      <div className="bg-white shadow">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">Friends</h1>
            <Link 
              href="/chat" 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Chat
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Options */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setSearchType('email')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                searchType === 'email' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Search by Email
            </button>
            <button
              onClick={() => setSearchType('username')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                searchType === 'username' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Search by Username
            </button>
            <button
              onClick={() => {
                setSearchType('qr');
                setShowQRCode(true);
              }}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                searchType === 'qr' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              QR Code
            </button>
          </div>

          {/* Search Form */}
          {searchType !== 'qr' && (
            <form onSubmit={handleSearch} className="flex gap-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search by ${searchType}`}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Search
              </button>
            </form>
          )}

          {/* QR Code Section */}
          {searchType === 'qr' && (
            <div className="mt-4">
              <div className="flex gap-4 mb-4">
                <button
                  onClick={() => setShowQRCode(true)}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Show My QR Code
                </button>
                <button
                  onClick={() => setScanning(true)}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Scan QR Code
                </button>
              </div>

              {showQRCode && myQRCode && (
                <div className="mt-4 p-6 bg-white rounded-lg border border-gray-200">
                  <h3 className="text-lg font-semibold mb-4">My QR Code</h3>
                  <div className="inline-block p-4 bg-white rounded-lg shadow-lg">
                    <Image src={myQRCode} alt="My QR Code" width={200} height={200} className="rounded-lg" />
                  </div>
                </div>
              )}

              {scanning && (
                <div className="mt-4 p-6 bg-white rounded-lg border border-gray-200">
                  <h3 className="text-lg font-semibold mb-4">Scan QR Code</h3>
                  <div className="relative inline-block">
                    <QRScanner
                      onScan={handleQRScan}
                      onError={(error) => toast.error(error)}
                    />
                    <button
                      onClick={() => setScanning(false)}
                      className="absolute top-2 right-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Search Result */}
        {searchResult && (
          <div className="mb-6 bg-white shadow rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {searchResult.photoURL ? (
                  <Image
                    src={searchResult.photoURL}
                    alt={searchResult.displayName || "User"}
                    width={48}
                    height={48}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium text-lg">
                    {searchResult.displayName
                      ? searchResult.displayName[0].toUpperCase()
                      : "?"}
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {searchResult.displayName || "Anonymous User"}
                  </p>
                  <p className="text-sm text-gray-500">{searchResult.email}</p>
                </div>
              </div>
              <button
                onClick={() => sendRequest(searchResult.uid)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Add Friend
              </button>
            </div>
          </div>
        )}

        {/* Friend Requests */}
        {requests.received.length > 0 && (
          <div className="mb-8 bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Friend Requests</h2>
            <div className="space-y-4">
              {requests.received.map((request) => (
                <div
                  key={request.id}
                  className="p-4 border border-gray-200 rounded-lg flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    {request.photoURL ? (
                      <Image
                        src={request.photoURL}
                        alt={request.displayName || "User"}
                        width={48}
                        height={48}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium text-lg">
                        {request.displayName
                          ? request.displayName[0].toUpperCase()
                          : "?"}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {request.displayName || "Anonymous User"}
                      </p>
                      <p className="text-sm text-gray-500">{request.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => acceptRequest(request.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => rejectRequest(request.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends List */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">My Friends</h2>
          {friends.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No friends yet. Start by searching for friends above!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="p-4 border border-gray-200 rounded-lg flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    {friend.photoURL ? (
                      <Image
                        src={friend.photoURL}
                        alt={friend.displayName || "User"}
                        width={48}
                        height={48}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium text-lg">
                        {friend.displayName
                          ? friend.displayName[0].toUpperCase()
                          : "?"}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {friend.displayName || "Anonymous User"}
                      </p>
                      <p className="text-sm text-gray-500">{friend.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => startChat(friend.id)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Message
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
