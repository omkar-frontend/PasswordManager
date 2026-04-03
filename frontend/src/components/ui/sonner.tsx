import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/** Matches `index.css` @theme — tweak here for toast-only adjustments. */
export const toastCustomColors = {
  "--normal-bg": "#171717",
  "--normal-bg-hover": "#1c1c1f",
  "--normal-border": "#27272a",
  "--normal-border-hover": "#3f3f46",
  "--normal-text": "#F4F4F5",
  "--border-radius": "0.625rem",
} as const satisfies Record<string, string>

const Toaster = ({ theme = "dark", style, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={{ ...toastCustomColors, ...style } as CSSProperties}
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
