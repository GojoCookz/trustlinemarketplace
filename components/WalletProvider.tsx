"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type WalletState = {
  address: string | null;
  userId: string | null;
  referralCode: string | null;
  xp: number;
  level: number;
  title: string;
  streak: number;
  isConnecting: boolean;
  isDevMode: boolean;
  connect: () => Promise<void>;
  devLogin: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletState>({
  address: null,
  userId: null,
  referralCode: null,
  xp: 0,
  level: 0,
  title: "newcomer",
  streak: 0,
  isConnecting: false,
  isDevMode: false,
  connect: async () => {},
  devLogin: async () => {},
  disconnect: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(0);
  const [title, setTitle] = useState("newcomer");
  const [streak, setStreak] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("tl_wallet");
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setAddress(data.address);
        setUserId(data.userId);
        setReferralCode(data.referralCode);
        setXp(data.xp ?? 0);
        setLevel(data.level ?? 0);
        setTitle(data.title ?? "newcomer");
        setStreak(data.streak ?? 0);
        setIsDevMode(data.isDevMode ?? false);
      } catch {
        localStorage.removeItem("tl_wallet");
      }
    }
  }, []);

  function saveState(data: {
    address: string;
    userId: string;
    referralCode: string;
    xp: number;
    level: number;
    title: string;
    streak: number;
    isDevMode: boolean;
  }) {
    setAddress(data.address);
    setUserId(data.userId);
    setReferralCode(data.referralCode);
    setXp(data.xp);
    setLevel(data.level);
    setTitle(data.title);
    setStreak(data.streak);
    setIsDevMode(data.isDevMode);
    localStorage.setItem("tl_wallet", JSON.stringify(data));
    localStorage.setItem("tl_user_id", data.userId);
  }

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const res = await fetch("/api/auth/xaman", { method: "POST" });
      const data = await res.json();

      if (!data.success) {
        if (res.status === 503) {
          await devLoginInner();
          return;
        }
        throw new Error(data.error);
      }

      const payload = data.data;
      const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = payload.deepLink;
      } else {
        window.open(payload.qrUrl, "xaman_qr", "width=400,height=500");
      }

      const ws = new WebSocket(payload.websocketUrl);
      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.signed === true) {
          ws.close();
          const verifyRes = await fetch("/api/auth/xaman/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payloadUuid: payload.payloadUuid }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            saveState({
              address: verifyData.data.address,
              userId: verifyData.data.id,
              referralCode: verifyData.data.referralCode,
              xp: verifyData.data.xp,
              level: verifyData.data.level,
              title: verifyData.data.title,
              streak: verifyData.data.streak,
              isDevMode: false,
            });
          }
        }
        if (msg.signed === false) {
          ws.close();
        }
      };
    } catch {
      // silent
    } finally {
      setIsConnecting(false);
    }
  }, []);

  async function devLoginInner() {
    setIsConnecting(true);
    try {
      const res = await fetch("/api/auth/dev", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        saveState({
          address: data.data.address,
          userId: data.data.id,
          referralCode: data.data.referralCode,
          xp: data.data.xp,
          level: data.data.level,
          title: data.data.title,
          streak: data.data.streak,
          isDevMode: true,
        });
        if (data.data._dev?.secret) {
          localStorage.setItem("tl_dev_secret", data.data._dev.secret);
        }
      }
    } catch {
      // silent
    } finally {
      setIsConnecting(false);
    }
  }

  const devLogin = useCallback(devLoginInner, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setUserId(null);
    setReferralCode(null);
    setXp(0);
    setLevel(0);
    setTitle("newcomer");
    setStreak(0);
    setIsDevMode(false);
    localStorage.removeItem("tl_wallet");
    localStorage.removeItem("tl_user_id");
    localStorage.removeItem("tl_dev_secret");
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address,
        userId,
        referralCode,
        xp,
        level,
        title,
        streak,
        isConnecting,
        isDevMode,
        connect,
        devLogin,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
