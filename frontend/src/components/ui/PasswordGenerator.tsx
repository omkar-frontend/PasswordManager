import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw, Wand2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { copySecret } from "@/lib/clipboard";
import {
  activePools,
  entropyBits,
  generatePassword,
  MAX_LENGTH,
  MIN_LENGTH,
  readStoredOptions,
  storeOptions,
  type GeneratorOptions,
} from "@/lib/passwordGenerator";

const TOGGLES: { key: keyof GeneratorOptions; label: string }[] = [
  { key: "uppercase", label: "A–Z" },
  { key: "lowercase", label: "a–z" },
  { key: "digits", label: "0–9" },
  { key: "symbols", label: "!@#" },
];

/** Coarse buckets for the strength bar. Keyspace only — not guessability. */
function strength(bits: number): { label: string; ratio: number; color: string } {
  if (bits < 50) return { label: "Weak", ratio: 0.25, color: "bg-red-500" };
  if (bits < 75) return { label: "Fair", ratio: 0.5, color: "bg-amber-500" };
  if (bits < 100) return { label: "Strong", ratio: 0.75, color: "bg-emerald-500" };
  return { label: "Very strong", ratio: 1, color: "bg-violet-500" };
}

export default function PasswordGenerator({
  onUse,
  disabled = false,
}: {
  onUse: (password: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<GeneratorOptions>(readStoredOptions);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const bits = entropyBits(options);
  const meter = strength(bits);

  // Persisting is a plain side effect. Generating is not: it belongs in the handlers
  // below, since setting state from an effect cascades an extra render each time.
  useEffect(() => {
    storeOptions(options);
  }, [options]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // A fresh suggestion each time the panel opens.
    if (next) setPassword(generatePassword(options));
  };

  const setOption = <K extends keyof GeneratorOptions>(key: K, value: GeneratorOptions[K]) => {
    const next = { ...options, [key]: value };
    // Refuse to turn off the last character set; there would be nothing to draw from.
    if (activePools(next).length === 0) return;
    setOptions(next);
    setPassword(generatePassword(next));
  };

  const copy = async () => {
    if (!password) return;
    try {
      await copySecret(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The Use button remains available if the clipboard is unavailable.
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="icon-button"
              aria-label="Generate a password"
              disabled={disabled}
            >
              <Wand2 className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Generate a password</TooltipContent>
      </Tooltip>

      <PopoverContent side="bottom" align="end" className="w-80 border-hairline bg-surface p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-1 rounded-xl border border-hairline bg-surface-2/60 p-2.5">
            <p className="min-w-0 flex-1 font-mono text-sm break-all text-theme-text">
              {password || "No character sets selected"}
            </p>
            <button
              type="button"
              className="icon-button"
              onClick={() => void copy()}
              aria-label="Copy generated password"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setPassword(generatePassword(options))}
              aria-label="Generate another"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-theme-muted">{meter.label}</span>
              <span className="text-theme-muted">~{Math.round(bits)} bits</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className={`h-full rounded-full transition-all duration-200 ${meter.color}`}
                style={{ width: `${meter.ratio * 100}%` }}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <label htmlFor="generator-length" className="text-theme-muted">
                Length
              </label>
              <span className="font-mono text-theme-text">{options.length}</span>
            </div>
            <input
              id="generator-length"
              type="range"
              min={MIN_LENGTH}
              max={MAX_LENGTH}
              value={options.length}
              onChange={(e) => setOption("length", Number(e.target.value))}
              className="w-full cursor-pointer accent-violet-600"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {TOGGLES.map(({ key, label }) => {
              const active = options[key] as boolean;
              return (
                <button
                  key={key}
                  type="button"
                  className={`cursor-pointer rounded-lg border px-2.5 py-1.5 font-mono text-xs transition-colors ${
                    active
                      ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                      : "border-hairline bg-surface-2/60 text-theme-muted hover:text-theme-text"
                  }`}
                  onClick={() => setOption(key, !active)}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-theme-muted transition-colors hover:text-theme-text">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-violet-600"
              checked={options.excludeLookalikes}
              onChange={(e) => setOption("excludeLookalikes", e.target.checked)}
            />
            Avoid look-alike characters
          </label>

          <button
            type="button"
            className="button-theme w-full"
            disabled={!password}
            onClick={() => {
              onUse(password);
              setOpen(false);
            }}
          >
            Use this password
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
