"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";

const CATEGORIES = ["digital", "physical", "services", "general"] as const;

type SellerProfile = {
  user_id: string;
  display_name: string;
  bio: string | null;
  store_slug: string | null;
  category: string;
  verification_tier: string;
  total_sales: number;
  avg_rating: number;
};

export default function SellerPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem("tl_user_id");
    if (!id) {
      router.push("/hub");
      return;
    }
    setUserId(id);

    fetch(`/api/seller/${id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setProfile(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function handleCreate() {
    if (!userId || !name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/seller/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          displayName: name.trim(),
          bio: bio.trim() || undefined,
          category,
          storeSlug: slug.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
        setStep(3);
      }
    } catch {
      // handle error silently
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted">loading...</p>
      </div>
    );
  }

  if (profile && step !== 3) {
    return (
      <div className="flex flex-col gap-5 py-8">
        <button
          onClick={() => router.push("/market")}
          className="text-xs text-muted hover:text-foreground self-start"
        >
          &larr; back to market
        </button>

        <header>
          <h1 className="text-xl font-bold text-mint">[your store]</h1>
          <p className="text-xs text-muted">
            trustline.app/store/{profile.store_slug}
          </p>
        </header>

        <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-mint/10 flex items-center justify-center text-mint font-bold text-lg">
              {profile.display_name[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {profile.display_name}
              </p>
              <TierBadge tier={profile.verification_tier} />
            </div>
          </div>

          {profile.bio && (
            <p className="text-xs text-muted">{profile.bio}</p>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-[#1b1d28] p-2">
              <p className="text-sm font-bold text-foreground">
                {profile.total_sales}
              </p>
              <p className="text-[10px] text-muted">sales</p>
            </div>
            <div className="rounded-lg bg-[#1b1d28] p-2">
              <p className="text-sm font-bold text-foreground">
                {profile.avg_rating > 0 ? profile.avg_rating.toFixed(1) : "--"}
              </p>
              <p className="text-[10px] text-muted">rating</p>
            </div>
            <div className="rounded-lg bg-[#1b1d28] p-2">
              <p className="text-sm font-bold text-foreground">
                {profile.category}
              </p>
              <p className="text-[10px] text-muted">type</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => router.push("/market/sell")}
          className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm"
        >
          [create a listing]
        </button>

        <VerificationCard
          tier={profile.verification_tier}
          sales={profile.total_sales}
          rating={profile.avg_rating}
          userId={userId}
          onUpgrade={(newTier) => setProfile({ ...profile, verification_tier: newTier })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      <button
        onClick={() => (step > 1 && step < 3 ? setStep(step - 1) : router.push("/market"))}
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; {step > 1 ? "back" : "cancel"}
      </button>

      <header>
        <h1 className="text-xl font-bold text-mint">[become a seller]</h1>
        <p className="text-xs text-muted">
          {step === 3 ? "you're in" : `step ${step} of 2`}
        </p>
      </header>

      {step < 3 && (
        <div className="flex gap-1">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full ${
                s <= step ? "bg-mint" : "bg-white/10"
              }`}
            />
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted block mb-1">
              store name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="what should buyers call you?"
              maxLength={40}
              className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">
              what do you sell?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`rounded-lg border p-3 text-sm transition-colors ${
                    category === cat
                      ? "bg-mint/10 border-mint/30 text-mint"
                      : "bg-card border-white/5 text-foreground hover:border-mint/20"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => name.trim() && setStep(2)}
            disabled={!name.trim()}
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            [next]
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted block mb-1">
              bio (optional)
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="tell buyers about yourself"
              rows={3}
              maxLength={200}
              className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30 resize-none"
            />
            <p className="text-[10px] text-muted text-right mt-1">
              {bio.length}/200
            </p>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">
              store url (optional)
            </label>
            <div className="flex items-center gap-0 bg-card border border-white/5 rounded-lg overflow-hidden">
              <span className="text-xs text-muted px-3 bg-[#1b1d28] py-3 border-r border-white/5">
                trustline.app/store/
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))
                }
                placeholder="yourname"
                maxLength={30}
                className="flex-1 bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-lg bg-mint/5 border border-mint/10 p-3">
            <p className="text-xs text-mint font-medium mb-1">
              what you get as a seller
            </p>
            <ul className="text-xs text-muted space-y-1">
              <li>escrow-protected transactions</li>
              <li>buyer ratings and reviews</li>
              <li>store page with unique url</li>
              <li>3% platform fee (lower with verification)</li>
            </ul>
          </div>

          <button
            onClick={handleCreate}
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            {submitting ? "setting up..." : "[create store]"}
          </button>
        </div>
      )}

      {step === 3 && profile && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-mint/10 border border-mint/20 p-4 text-center">
            <p className="text-lg font-bold text-mint mb-1">you're a seller</p>
            <p className="text-xs text-muted">
              your store is live at trustline.app/store/{profile.store_slug}
            </p>
          </div>

          <VerificationCard tier="anon" sales={0} rating={0} />

          <button
            onClick={() => router.push("/market/sell")}
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm"
          >
            [create your first listing]
          </button>

          <button
            onClick={() => router.push("/market")}
            className="w-full py-2 text-xs text-muted hover:text-foreground"
          >
            back to market
          </button>
        </div>
      )}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    anon: "bg-white/10 text-muted",
    verified: "bg-blue-500/10 text-blue-400",
    trusted: "bg-purple-500/10 text-purple-400",
    elite: "bg-amber-500/10 text-amber-400",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
        colors[tier] ?? colors.anon
      }`}
    >
      {tier}
    </span>
  );
}

function VerificationCard({
  tier,
  sales,
  rating,
  userId,
  onUpgrade,
}: {
  tier: string;
  sales: number;
  rating: number;
  userId?: string | null;
  onUpgrade?: (newTier: string) => void;
}) {
  const { isDevMode } = useWallet();
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const tiers = [
    {
      id: "anon",
      label: "anon",
      desc: "no verification",
      fee: "3.0%",
      unlocked: true,
    },
    {
      id: "verified",
      label: "verified",
      desc: "pay 5 xrp verification fee",
      fee: "2.8%",
      unlocked: false,
    },
    {
      id: "trusted",
      label: "trusted",
      desc: "10+ sales, 4.5+ rating",
      fee: "2.5%",
      unlocked: sales >= 10 && rating >= 4.5,
    },
    {
      id: "elite",
      label: "elite",
      desc: "100+ sales, 4.8+ rating",
      fee: "2.0%",
      unlocked: sales >= 100 && rating >= 4.8,
    },
  ];

  const currentIdx = tiers.findIndex((t) => t.id === tier);

  async function handleVerify() {
    if (!userId) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const devSecret = isDevMode
        ? localStorage.getItem("tl_dev_secret")
        : undefined;
      const res = await fetch("/api/seller/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, devSecret }),
      });
      const data = await res.json();
      if (data.success) {
        onUpgrade?.(data.data.tier);
      } else {
        setVerifyError(data.error ?? "verification failed");
      }
    } catch {
      setVerifyError("verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">
        verification tiers
      </p>
      <p className="text-xs text-muted">
        higher tiers = lower fees + buyer trust
      </p>
      <div className="flex flex-col gap-2">
        {tiers.map((t, i) => (
          <div
            key={t.id}
            className={`rounded-lg border p-3 flex flex-col gap-2 ${
              t.id === tier
                ? "border-mint/30 bg-mint/5"
                : i <= currentIdx
                ? "border-white/10 bg-white/5"
                : "border-white/5 opacity-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {t.label} {t.id === tier && "(current)"}
                </p>
                <p className="text-[10px] text-muted">{t.desc}</p>
              </div>
              <span className="text-xs font-bold text-mint">{t.fee}</span>
            </div>
            {t.id === "verified" && tier === "anon" && userId && (
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="w-full py-2 rounded-lg bg-blue-500 text-white font-semibold text-xs disabled:opacity-40"
              >
                {verifying ? "paying 5 xrp..." : "[verify now — 5 xrp]"}
              </button>
            )}
          </div>
        ))}
      </div>
      {verifyError && (
        <p className="text-[10px] text-red-400">{verifyError}</p>
      )}
    </div>
  );
}
