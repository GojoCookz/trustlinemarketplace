"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type StoreProfile = {
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  category: string;
  slug: string;
  tier: string;
  totalSales: number;
  avgRating: number;
  socialX: string | null;
  socialDiscord: string | null;
  createdAt: string;
};

type ListingRow = {
  id: string;
  title: string;
  description: string;
  price_drops: number;
  category: string;
  image_urls: string;
  total_sold: number;
};

type ReviewRow = {
  stars: number;
  comment: string | null;
  created_at: string;
  buyer_code: string;
};

function dropsToXrp(d: number) {
  const xrp = d / 1_000_000;
  if (xrp >= 1000) return `${(xrp / 1000).toFixed(1)}k`;
  if (xrp >= 1) return xrp.toFixed(2);
  return xrp.toFixed(6);
}

const TIER_COLORS: Record<string, string> = {
  anon: "bg-white/10 text-muted",
  verified: "bg-blue-500/10 text-blue-400",
  trusted: "bg-purple-500/10 text-purple-400",
  elite: "bg-amber-500/10 text-amber-400",
};

const TIER_FEES: Record<string, string> = {
  anon: "3.0%",
  verified: "2.8%",
  trusted: "2.5%",
  elite: "2.0%",
};

export default function StorePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/store/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setProfile(data.data.profile);
          setListings(data.data.listings);
          setReviews(data.data.reviews);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted">loading store...</p>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <p className="text-sm text-muted">store not found</p>
        <Link href="/market" className="text-xs text-mint">
          &larr; back to market
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-8 max-w-2xl mx-auto px-4">
      <Link
        href="/market"
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; back to market
      </Link>

      {profile.bannerUrl && (
        <div className="w-full h-32 rounded-lg overflow-hidden bg-card">
          <img
            src={profile.bannerUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="rounded-lg bg-card border border-white/5 p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-mint/10 flex items-center justify-center text-mint font-bold text-2xl flex-shrink-0">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              profile.displayName[0].toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">
              {profile.displayName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  TIER_COLORS[profile.tier] ?? TIER_COLORS.anon
                }`}
              >
                {profile.tier}
              </span>
              <span className="text-[10px] text-muted">
                {TIER_FEES[profile.tier] ?? "3.0%"} fee
              </span>
            </div>
          </div>
        </div>

        {profile.bio && (
          <p className="text-sm text-muted leading-relaxed">{profile.bio}</p>
        )}

        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-lg bg-[#1b1d28] p-2">
            <p className="text-sm font-bold text-foreground">
              {profile.totalSales}
            </p>
            <p className="text-[10px] text-muted">sales</p>
          </div>
          <div className="rounded-lg bg-[#1b1d28] p-2">
            <p className="text-sm font-bold text-foreground">
              {profile.avgRating > 0 ? profile.avgRating.toFixed(1) : "--"}
            </p>
            <p className="text-[10px] text-muted">rating</p>
          </div>
          <div className="rounded-lg bg-[#1b1d28] p-2">
            <p className="text-sm font-bold text-foreground">
              {listings.length}
            </p>
            <p className="text-[10px] text-muted">listings</p>
          </div>
          <div className="rounded-lg bg-[#1b1d28] p-2">
            <p className="text-sm font-bold text-foreground">
              {profile.category}
            </p>
            <p className="text-[10px] text-muted">type</p>
          </div>
        </div>

        {(profile.socialX || profile.socialDiscord) && (
          <div className="flex gap-3 text-xs text-muted">
            {profile.socialX && <span>x: {profile.socialX}</span>}
            {profile.socialDiscord && (
              <span>discord: {profile.socialDiscord}</span>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted/60">
          seller since {new Date(profile.createdAt + "Z").toLocaleDateString()}
        </p>
      </div>

      {listings.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            listings ({listings.length})
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {listings.map((listing) => {
              const images = JSON.parse(
                listing.image_urls || "[]"
              ) as string[];
              return (
                <Link
                  key={listing.id}
                  href="/market"
                  className="flex flex-col gap-2 rounded-lg bg-card border border-white/5 p-3 hover:border-mint/20 transition-colors"
                >
                  <div className="w-full aspect-square rounded-md bg-white/5 flex items-center justify-center text-muted text-xs overflow-hidden">
                    {images.length > 0 ? (
                      <img
                        src={images[0]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-muted/40">no image</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground font-medium leading-tight line-clamp-2">
                    {listing.title}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-mint">
                      {dropsToXrp(listing.price_drops)} xrp
                    </span>
                    <span className="text-[10px] text-muted">
                      {listing.total_sold} sold
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {listings.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted">no listings yet</p>
        </div>
      )}

      {reviews.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            reviews ({reviews.length})
          </h2>
          <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
            {reviews.map((r, i) => (
              <div
                key={i}
                className="flex flex-col gap-1 border-t border-white/5 pt-2 first:border-0 first:pt-0"
              >
                <div className="flex items-center justify-between">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span
                        key={s}
                        className={`text-xs ${
                          s <= r.stars ? "text-amber-400" : "text-white/10"
                        }`}
                      >
                        *
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted">
                    {new Date(r.created_at + "Z").toLocaleDateString()}
                  </span>
                </div>
                {r.comment && (
                  <p className="text-xs text-muted">{r.comment}</p>
                )}
                <p className="text-[10px] text-muted/60">
                  buyer #{r.buyer_code}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
