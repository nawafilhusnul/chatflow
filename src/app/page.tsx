'use client';

import Link from "next/link";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/chat');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Welcome to NullVibes Chat
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Connect with others in real-time through our modern chat platform
          </p>
          
          <div className="space-y-4 sm:space-y-0 sm:space-x-4 flex flex-col sm:flex-row justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition duration-150 ease-in-out shadow-sm"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-8 py-3 border border-gray-300 text-base font-medium rounded-md text-indigo-600 bg-white hover:bg-gray-50 transition duration-150 ease-in-out shadow-sm"
            >
              Create Account
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="p-6 bg-white rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Real-time Chat</h3>
              <p className="text-gray-600">Instant messaging with real-time updates and notifications</p>
            </div>
            <div className="p-6 bg-white rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Secure</h3>
              <p className="text-gray-600">End-to-end encryption keeps your conversations private</p>
            </div>
            <div className="p-6 bg-white rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Modern UI</h3>
              <p className="text-gray-600">Clean and intuitive interface for the best user experience</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
