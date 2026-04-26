"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import ProfileAvatar from "@/components/ProfileAvatar";
import { getManagedAvatarUrl, isManagedAvatarUrl } from "@/lib/profile";
import { createClient } from "@/utils/supabase/client";

type ProfileAvatarEditorProps = {
  userId: string;
  displayName: string;
  initial: string;
  avatarUrl: string | null;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function ProfileAvatarEditor({
  userId,
  displayName,
  initial,
  avatarUrl,
}: ProfileAvatarEditorProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [supabase] = useState(() => createClient());
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(
    getManagedAvatarUrl(avatarUrl)
  );
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [hasVisibleAvatar, setHasVisibleAvatar] = useState(
    Boolean(getManagedAvatarUrl(avatarUrl))
  );

  useEffect(() => {
    const managedAvatarUrl = getManagedAvatarUrl(avatarUrl);
    setSavedAvatarUrl(managedAvatarUrl);
    setHasVisibleAvatar(Boolean(managedAvatarUrl));
  }, [avatarUrl]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Please choose an image smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }

    setLocalPreviewUrl(objectUrl);
    setHasVisibleAvatar(true);
    setError(null);
    setIsUploading(true);

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${userId}/${Date.now()}-${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      setError(uploadError.message);
      setLocalPreviewUrl(null);
      setHasVisibleAvatar(Boolean(savedAvatarUrl));
      setIsUploading(false);
      event.target.value = "";
      URL.revokeObjectURL(objectUrl);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const cacheSafePublicUrl = `${publicUrl}?v=${Date.now()}`;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: cacheSafePublicUrl })
      .eq("id", userId);

    if (profileError) {
      setError(profileError.message);
      setLocalPreviewUrl(null);
      setHasVisibleAvatar(Boolean(savedAvatarUrl));
      setIsUploading(false);
      event.target.value = "";
      URL.revokeObjectURL(objectUrl);
      return;
    }

    setSavedAvatarUrl(cacheSafePublicUrl);
    setIsUploading(false);
    event.target.value = "";
    router.refresh();
  };

  const getStoragePathFromPublicUrl = (publicUrl: string) => {
    try {
      const url = new URL(publicUrl);
      const marker = "/storage/v1/object/public/avatars/";
      const markerIndex = url.pathname.indexOf(marker);

      if (markerIndex === -1) {
        return null;
      }

      return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    } catch {
      return null;
    }
  };

  const handleRemovePhoto = async () => {
    setError(null);
    setIsRemoving(true);

    const previousAvatarUrl = savedAvatarUrl;
    const storagePath = previousAvatarUrl
      ? getStoragePathFromPublicUrl(previousAvatarUrl)
      : null;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", userId);

    if (profileError) {
      setError(profileError.message);
      setIsRemoving(false);
      return;
    }

    if (storagePath) {
      await supabase.storage.from("avatars").remove([storagePath]);
    }

    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }

    setLocalPreviewUrl(null);
    setSavedAvatarUrl(null);
    setHasVisibleAvatar(false);
    setIsRemoving(false);
    router.refresh();
  };

  const isBusy = isUploading || isRemoving;
  const handleImageAvailabilityChange = useCallback((available: boolean) => {
    setHasVisibleAvatar(available && isManagedAvatarUrl(localPreviewUrl ?? savedAvatarUrl));
  }, [localPreviewUrl, savedAvatarUrl]);

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative">
        <div className="rounded-full border border-zinc-800 shadow-lg shadow-blue-950/30">
          <ProfileAvatar
            avatarUrl={localPreviewUrl ?? savedAvatarUrl}
            alt={`${displayName} avatar`}
            fallback={initial}
            seed={userId}
            sizeClassName="h-24 w-24"
            textClassName="text-3xl font-semibold"
            onImageAvailabilityChange={handleImageAvailabilityChange}
          />
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
          className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-100 transition hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
          aria-label="Change profile picture"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
          Profile photo
        </p>
        <p className="text-sm text-zinc-300">
          Tap the edit icon to choose an image from your files or gallery.
        </p>
        {hasVisibleAvatar ? (
          <button
            type="button"
            onClick={handleRemovePhoto}
            disabled={isBusy}
            className="text-sm text-red-300 transition hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isRemoving ? "Removing photo..." : "Remove photo"}
          </button>
        ) : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
