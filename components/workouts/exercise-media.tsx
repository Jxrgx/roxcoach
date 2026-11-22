import Image from "next/image";
import { ExternalLink, ImageOff, Play } from "lucide-react";
import { mediaHost, type MediaTypeValue } from "@/lib/exercises/rules";
import { cn } from "@/lib/utils/cn";

const PATTERN = {
  backgroundImage: "repeating-linear-gradient(135deg, transparent 0 14px, rgb(255 255 255 / 0.025) 14px 28px)",
};

interface ExerciseMediaProps {
  name: string;
  mediaType: MediaTypeValue | null;
  mediaUrl: string | null;
  /** "thumb" en tarjetas; "full" en el detalle (con enlace para abrir el video). */
  variant?: "thumb" | "full";
  className?: string;
}

/**
 * Medio visual de un ejercicio por URL.
 * - Imagen: se muestra directamente (sin optimizador de Next: el dominio es
 *   libre) y sin enviar referrer.
 * - Video: nunca se incrusta un reproductor de terceros; en el detalle hay un
 *   enlace "Ver video" que abre en otra pestaña.
 */
export function ExerciseMedia({ name, mediaType, mediaUrl, variant = "thumb", className }: ExerciseMediaProps) {
  const host = mediaUrl ? mediaHost(mediaUrl) : null;
  const frame = cn("relative flex aspect-video items-center justify-center overflow-hidden bg-surface-2", className);

  if (mediaType === "imagen" && mediaUrl && host) {
    return (
      <div className={frame}>
        <Image
          src={mediaUrl}
          alt={`Imagen de ${name}`}
          fill
          unoptimized
          referrerPolicy="no-referrer"
          sizes={variant === "full" ? "(min-width: 768px) 720px, 100vw" : "(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"}
          className="object-cover"
        />
      </div>
    );
  }

  if (mediaType === "video" && mediaUrl && host) {
    if (variant === "thumb") {
      return (
        <div role="img" aria-label={`${name}: video de demostración`} className={frame} style={PATTERN}>
          <span className="flex size-12 items-center justify-center rounded-full border border-line bg-bg/80">
            <Play aria-hidden className="ml-0.5 size-5 text-ink" />
          </span>
        </div>
      );
    }
    return (
      <div className={frame} style={PATTERN}>
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 flex-col items-center gap-2 rounded-2xl px-4 py-3 text-center hover:bg-bg/40"
        >
          <span className="flex size-14 items-center justify-center rounded-full border border-line bg-bg/80">
            <Play aria-hidden className="ml-0.5 size-6 text-ink" />
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            Ver video <ExternalLink aria-hidden className="size-4" />
          </span>
          <span className="text-sm text-muted">Se abre en {host}</span>
        </a>
      </div>
    );
  }

  return (
    <div role="img" aria-label={`${name}: sin medio visual`} className={frame} style={PATTERN}>
      <span className="flex items-center gap-1.5 text-sm text-muted">
        <ImageOff aria-hidden className="size-4" />
        Sin video ni imagen
      </span>
    </div>
  );
}
