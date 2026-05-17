'use client';
import Image from 'next/image';
import { useState, useEffect } from 'react';

type Img = { id: string; url: string };

export function ImageGallery({ images, alt }: { images: Img[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [images]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (images.length <= 1) return;
      if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % images.length);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length]);

  if (images.length === 0) {
    return <div className="aspect-square bg-bone-dark flex items-center justify-center text-ink-soft text-sm">no image</div>;
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-square bg-bone-dark overflow-hidden">
        <Image
          key={images[idx].id}
          src={images[idx].url}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
          className="object-cover"
        />
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="prev"
              onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-bone/80 backdrop-blur border border-line text-sm"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="next"
              onClick={() => setIdx((i) => (i + 1) % images.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-bone/80 backdrop-blur border border-line text-sm"
            >
              ›
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] tracking-wider bg-bone/80 px-2 py-0.5 border border-line tabular-nums">
              {idx + 1} / {images.length}
            </div>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIdx(i)}
              className={`relative w-16 h-16 shrink-0 border ${
                i === idx ? 'border-accent' : 'border-line'
              }`}
              aria-label={`image ${i + 1}`}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
