"use client";
import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatarVariants = cva("relative inline-flex shrink-0 overflow-hidden rounded-full ring-2 ring-card", {
  variants: {
    size: { xs: "size-5 text-[0.5625rem]", sm: "size-6 text-[0.625rem]", md: "size-8 text-caption", lg: "size-10 text-body" },
  },
  defaultVariants: { size: "sm" },
});

/** Palette déterministe des avatars à initiales (fond doux + texte foncé, AA). */
const tones = [
  "bg-label-bleu-bg text-label-bleu-fg",
  "bg-label-vert-bg text-label-vert-fg",
  "bg-label-violet-bg text-label-violet-fg",
  "bg-label-orange-bg text-label-orange-fg",
  "bg-label-cyan-bg text-label-cyan-fg",
  "bg-label-rose-bg text-label-rose-fg",
];

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function toneFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return tones[h % tones.length];
}

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string;
  src?: string;
  className?: string;
  /** Masquer le nom aux lecteurs d'écran quand il est déjà affiché à côté. */
  decorative?: boolean;
}

export function Avatar({ name, src, size, className, decorative }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(avatarVariants({ size }), className)}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      title={name}
    >
      {src && <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />}
      <AvatarPrimitive.Fallback className={cn("flex size-full items-center justify-center font-semibold", toneFor(name))}>
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function AvatarGroup({ names, max = 3, size = "sm" }: { names: string[]; max?: number; size?: AvatarProps["size"] }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <div className="flex -space-x-1.5" aria-label={names.join(", ")} role="group">
      {shown.map((n) => (
        <Avatar key={n} name={n} size={size} decorative />
      ))}
      {rest > 0 && (
        <span className={cn(avatarVariants({ size }), "items-center justify-center bg-surface-active font-semibold text-fg-secondary")} aria-hidden>
          +{rest}
        </span>
      )}
    </div>
  );
}
