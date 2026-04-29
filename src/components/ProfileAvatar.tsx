"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getManagedAvatarUrl, getProfileAvatarColor } from "@/lib/profile";

type ProfileAvatarProps = {
  avatarUrl: string | null;
  alt: string;
  fallback: string;
  seed: string;
  sizeClassName: string;
  textClassName: string;
  onImageAvailabilityChange?: (available: boolean) => void;
};

export default function ProfileAvatar({
  avatarUrl,
  alt,
  fallback,
  seed,
  sizeClassName,
  textClassName,
  onImageAvailabilityChange,
}: ProfileAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const managedAvatarUrl = getManagedAvatarUrl(avatarUrl);
  const previewAvatarUrl =
    typeof avatarUrl === "string" &&
    (avatarUrl.startsWith("blob:") || avatarUrl.startsWith("data:"))
      ? avatarUrl
      : null;
  const displayAvatarUrl = previewAvatarUrl ?? managedAvatarUrl;
  const fallbackColor = getProfileAvatarColor(seed);
  const showImage = Boolean(displayAvatarUrl) && !hasImageError;

  useEffect(() => {
    setHasImageError(false);
  }, [displayAvatarUrl]);

  useEffect(() => {
    onImageAvailabilityChange?.(Boolean(displayAvatarUrl) && !hasImageError);
  }, [displayAvatarUrl, hasImageError, onImageAvailabilityChange]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-full text-white ${sizeClassName} ${textClassName}`}
      style={{ backgroundColor: showImage ? "transparent" : fallbackColor }}
    >
      {showImage && displayAvatarUrl ? (
        <Image
          src={displayAvatarUrl}
          alt={alt}
          fill
          sizes="64px"
          unoptimized
          className="absolute inset-0 block h-full w-full scale-[1.03] object-cover"
          onLoad={() => onImageAvailabilityChange?.(true)}
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span className="relative z-10">{fallback}</span>
      )}
    </div>
  );
}
