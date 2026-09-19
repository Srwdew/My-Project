import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { apiFetch } from '../api';
import { getToken, useSessionKey } from '../auth';
type Profile = {
    userId: string;
    email: string;
    displayName: string | null;
    hasAvatar?: boolean;
};
type Value = {
    profile: Profile | null;
    avatarUrl: string | null;
    loading: boolean;
    error: string;
    reloadProfile: () => void;
    updateDisplayName: (name: string) => Promise<void>;
};
const ProfileContext = createContext<Value | null>(null);
export function ProfileProvider({ children }: {
    children: ReactNode;
}) {
    const session = useSessionKey();
    return <SessionProfile key={session ?? 'logged-out'} session={session}>{children}</SessionProfile>;
}
function SessionProfile({ children, session }: {
    children: ReactNode;
    session: string | null;
}) {
    const [profile, setProfile] = useState<Profile | null>(null), [avatarUrl, setAvatar] = useState<string | null>(null);
    const [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const valid = () => alive.current && getToken() === session;
    const reloadProfile = useCallback(() => setRevision(v => v + 1), []);
    useEffect(() => {
        const controller = new AbortController();
        let url: string | null = null;
        setProfile(null);
        setAvatar(null);
        setError('');
        setLoading(true);
        if (!session) {
            setLoading(false);
            return;
        }
        void (async () => {
            try {
                const response = await apiFetch('/profile', { signal: controller.signal });
                if (!response.ok)
                    throw Error('โหลดโปรไฟล์ไม่สำเร็จ');
                const data: Profile = await response.json();
                if (!valid() || controller.signal.aborted)
                    return;
                setProfile(data);
                if (data.hasAvatar) {
                    const avatar = await apiFetch('/profile/avatar', { signal: controller.signal });
                    if (avatar.ok) {
                        const blob = await avatar.blob();
                        if (!valid() || controller.signal.aborted)
                            return;
                        url = URL.createObjectURL(blob);
                        setAvatar(url);
                    }
                }
            }
            catch {
                if (valid() && !controller.signal.aborted)
                    setError('โหลดโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง');
            }
            finally {
                if (valid() && !controller.signal.aborted)
                    setLoading(false);
            }
        })();
        return () => { controller.abort(); if (url)
            URL.revokeObjectURL(url); };
    }, [session, revision]);
    async function updateDisplayName(name: string) { const response = await apiFetch('/profile', { method: 'PUT', body: JSON.stringify({ displayName: name.trim() }) }); if (!response.ok)
        throw Error('บันทึกชื่อไม่สำเร็จ'); const result: Profile = await response.json(); if (valid()) {
        setProfile(result);
        reloadProfile();
    } }
    return <ProfileContext.Provider value={{ profile, avatarUrl, loading, error, reloadProfile, updateDisplayName }}>{children}</ProfileContext.Provider>;
}
export function useProfile() { const value = useContext(ProfileContext); if (!value)
    throw Error('ProfileProvider required'); return value; }
