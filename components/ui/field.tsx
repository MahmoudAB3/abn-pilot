import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

/**
 * Champ de formulaire accessible : relie libellé, aide et erreur à l'élément
 * via htmlFor / aria-describedby / aria-invalid.
 */
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Élément de saisie (reçoit id/aria automatiquement) ou fonction de rendu pour les contrôles composés (Select). */
  children: React.ReactElement<Record<string, unknown>> | ((control: FieldControlProps) => React.ReactNode);
}) {
  const hintId = hint ? `${id}-aide` : undefined;
  const errorId = error ? `${id}-erreur` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control: FieldControlProps = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required || undefined,
  };
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
      </Label>
      {typeof children === "function" ? children(control) : React.cloneElement(children, control as unknown as Record<string, unknown>)}
      {hint && !error && <p id={hintId} className="text-caption text-muted-foreground">{hint}</p>}
      {error && <p id={errorId} className="text-caption font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}
