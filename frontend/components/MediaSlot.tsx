"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  /** Path under /public, e.g. "/media/slot-1.gif". Drop your own file there to fill the slot. */
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

/**
 * A pixel-framed media slot for cartoons / GIFs / screenshots.
 * If the file doesn't exist yet, it renders a retro "INSERT MEDIA" placeholder instead.
 */
export default function MediaSlot({ src, alt, label, ratio = "1 / 1", caption, priority, className = "" }: Props) {
  const [missing, setMissing] = useState(false);

  return (
    <figure className={`media-slot ${className}`} style={{ aspectRatio: ratio }}>
      {missing ? (
        <div className="media-placeholder" role="img" aria-label={`Empty media slot: ${label}`}>
          <span className="ph-icon" aria-hidden="true">▣</span>
          <span>INSERT MEDIA</span>
          <small>{label}</small>
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized /* keeps GIF animation + crisp pixels */
          priority={priority}
          sizes="(max-width: 800px) 100vw, 50vw"
          onError={() => setMissing(true)}
        />
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

