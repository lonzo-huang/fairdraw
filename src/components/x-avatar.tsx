import { useState } from "react";

/** Public X avatar resolver — same source the campaign hub uses. */
export function xAvatarUrl(handle: string): string {
  return `https://unavatar.io/x/${handle}`;
}

/**
 * Circular winner avatar: renders the X profile picture inside the given
 * circle class (.face / .av), falling back to the handle's first letter
 * when the image can't be loaded or the handle is missing.
 */
export function XAvatarDisc({ handle, className }: { handle: string | null | undefined; className: string }) {
  const [failed, setFailed] = useState(false);
  const h = (handle ?? "").trim().replace(/^@/, "");
  const letter = ((h || "?")[0] ?? "?").toUpperCase();
  return (
    <span className={className}>
      {h && !failed ? (
        <img src={xAvatarUrl(h)} alt={`@${h}`} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        letter
      )}
    </span>
  );
}
