"use client";

import Image from "next/image";
import { useRef, useState } from "react";

type Props = {
  /** Path under /public, e.g. "/media/slot-1.mp4" or "/media/hero.jpg". */
  src: string;
  alt: string;
  /** Shown on the placeholder when the file is missing. */
  label: string;
  /** CSS aspect-ratio, e.g. "16 / 9" or "1 / 1". */
  ratio?: string;
  caption?: string;
  priority?: boolean;
  className?: string;
};

const VIDEO_EXTS = [".mp4", ".webm", ".mov", ".ogg"];

function isVideo(src: string) {
  const lower = src.toLowerCase().split("?")[0]; // strip query params
  return VIDEO_EXTS.some((ext) => lower.endsWith(ext));
}

function mimeType(src: string): string {
  const lower = src.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov"))  return "video/mp4";  // browsers treat .mov as mp4
  if (lower.endsWith(".ogg"))  return "video/ogg";
  return "video/mp4";
}

/**
 * A pixel-framed media slot that handles images (jpg/png/gif/webp)
 * AND videos (mp4/webm/mov). Falls back to a retro "INSERT MEDIA"
 * placeholder when the file is missing or fails to load.
 */
export default function MediaSlot({
  src, alt, label, ratio = "1 / 1", caption, priority, className = "",
}: Props) {
  const [missing, setMissing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const video = isVideo(src);

  return (
    <figure className={`media-slot ${className}`} style={{ aspectRatio: ratio }}>
      {missing ? (
        <div className="media-placeholder" role="img" aria-label={`Empty media slot: ${label}`}>
          <span className="ph-icon" aria-hidden="true">▣</span>
          <span>INSERT MEDIA</span>
          <small>{label}</small>
        </div>
      ) : video ? (
        /* ---------- VIDEO ---------- */
        <video
          ref={videoRef}
          className="slot-video"
          autoPlay
          loop
          muted          /* required for autoplay in all browsers */
          playsInline    /* prevents full-screen takeover on iOS */
          aria-label={alt}
          onError={() => setMissing(true)}
        >
          <source src={src} type={mimeType(src)} />
          {/* Fallback text for very old browsers */}
          Your browser does not support video.
        </video>
      ) : (
        /* ---------- IMAGE ---------- */
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized   /* keeps GIF animation + crisp pixel art */
          priority={priority}
          sizes="(max-width: 800px) 100vw, 50vw"
          onError={() => setMissing(true)}
        />
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
