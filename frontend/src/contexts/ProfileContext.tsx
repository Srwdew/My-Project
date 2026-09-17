import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { apiFetch } from '../api';

type Profile = {
  userId: string;
  email: string;
  displayName: string | null;
};

type ProfileContextValue = {
  profile: Profile | null;
  loading: boolean;
  error: string;
  reloadProfile: () => void;
  updateDisplayName: (displayName: string) => Promise<void>;
};

const ProfileContext =
  createContext<ProfileContextValue | null>(null);

type ProfileProviderProps = {
  children: ReactNode;
};

export function ProfileProvider({
  children,
}: ProfileProviderProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const loadProfile = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await apiFetch('/profile', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('ไม่สามารถโหลดโปรไฟล์ได้');
        }

        const data: Profile = await response.json();

        if (!controller.signal.aborted) {
          setProfile(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้'
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      controller.abort();
    };
  }, [reloadCount]);

  const reloadProfile = () => {
    setReloadCount((current) => current + 1);
  };

  const updateDisplayName = async (displayName: string) => {
    const response = await apiFetch('/profile', {
      method: 'PUT',
      body: JSON.stringify({
        displayName: displayName.trim(),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);

      throw new Error(
        data?.error || 'ไม่สามารถบันทึกชื่อได้'
      );
    }

    const updatedProfile: Profile = await response.json();

    setProfile(updatedProfile);
  };

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        error,
        reloadProfile,
        updateDisplayName,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);

  if (!context) {
    throw new Error(
      'ต้องใช้ useProfile ภายใน ProfileProvider'
    );
  }

  return context;
}