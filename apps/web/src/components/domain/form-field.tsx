import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormError = string | { message?: string } | undefined;

export interface FormFieldProps {
  id: string;
  label: string;
  error?: FormError;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Campo de formulário com label, erro acessível e hint. */
export function FormField({ id, label, error, hint, children, className }: FormFieldProps) {
  const message = typeof error === "string" ? error : error?.message;
  const describedBy = message ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const control =
    isValidElement(children) && describedBy
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          "aria-describedby": describedBy,
          ...(message ? { "aria-invalid": true } : {}),
        })
      : children;

  return (
    <div data-slot="form-field" className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-negative">
          {message}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
