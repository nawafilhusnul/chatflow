"use client";

import { useState, useEffect } from "react";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/core/config/firebase";
import { userService } from "@/infrastructure/services/user.service"; // Assuming userService is defined in this file

export interface AuthError {
  code: string;
  message: string;
}

interface UseAuth {
  user: User | null;
  loading: boolean;
  error: AuthError | null;
  register: (
    email: string,
    password: string,
    username?: string
  ) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

export const useAuth = (): UseAuth => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAuthError = (error: any) => {
    console.error("Auth error:", error);
    let message = "An unexpected error occurred";

    switch (error.code) {
      case "auth/email-already-in-use":
        message = "This email is already registered";
        break;
      case "auth/weak-password":
        message = "Password should be at least 6 characters";
        break;
      case "auth/invalid-email":
        message = "Invalid email address";
        break;
      case "auth/user-not-found":
      case "auth/wrong-password":
        message = "Invalid email or password";
        break;
      case "auth/too-many-requests":
        message = "Too many attempts. Please try again later";
        break;
      case "auth/network-request-failed":
        message = "Network error. Please check your connection";
        break;
    }

    setError({ code: error.code, message });
  };

  const register = async (
    email: string,
    password: string,
    username?: string
  ): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Basic validation
      if (!email || !password) {
        throw new Error("Email and password are required");
      }

      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Create user profile with username
      if (userCredential.user) {
        await userService.upsertProfile(userCredential.user.uid, {
          email,
          username,
        });
        await sendEmailVerification(userCredential.user);
      }
    } catch (error: any) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Basic validation
      if (!email || !password) {
        throw new Error("Email and password are required");
      }

      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await signOut(auth);
    } catch (error: any) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      if (!email) {
        throw new Error("Email is required");
      }

      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    user,
    loading,
    error,
    register,
    login,
    logout,
    resetPassword,
    clearError,
  };
};
