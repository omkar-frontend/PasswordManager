import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type TruncatedTextProps = {
  text: string;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
};

/**
 * One line of text with a tooltip carrying the full value — but only when it is actually
 * clipped, so short labels do not get a redundant hover card.
 *
 * The Tooltip wrapper is always mounted and only the content is conditional. Swapping the
 * wrapper in and out instead would remount the paragraph, leaving the ResizeObserver bound
 * to a detached node and the measurement frozen at its first (possibly pre-layout) value.
 */
export default function TruncatedText({ text, className, side = "bottom" }: TruncatedTextProps) {
  // A callback ref in state, so the measuring effect re-runs if the node is ever replaced.
  const [node, setNode] = useState<HTMLParagraphElement | null>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    if (!node) return;

    const measure = () => {
      // A hidden tab or collapsed pane reports 0 width, where every string looks clipped.
      // Skip those and keep the last real answer; the observer re-fires once it has size.
      if (node.clientWidth === 0) return;
      setClipped(node.scrollWidth > node.clientWidth);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    // Text metrics change when the web font swaps in, which can flip the verdict.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [node, text]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p
          ref={setNode}
          className={cn("w-fit max-w-full truncate", clipped && "cursor-default", className)}
        >
          {text}
        </p>
      </TooltipTrigger>
      {clipped ? (
        <TooltipContent side={side} align="start">
          {text}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
