// Reader/model conditioning: downscale a page image before sending to a live VLM.
// The originals are ~5332x6845 (~4-5 MB) — too large/expensive to send raw and above
// some providers' pixel budgets. We resample the long edge down to VLM_MAX_EDGE.
// This is delivery conditioning, not a pipeline Stage-1 (segmentation) step.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { ROOT } from "../config.ts";

const CONDITIONED_DIR = resolve(ROOT, "scratch", "conditioned");

// Returns { data: base64, mediaType }. Falls back to the original bytes if sips
// is unavailable (non-macOS) — the provider still works, just heavier.
export function conditionedImage(
  imagePath: string,
  maxEdge: number,
): { data: string; mediaType: string } {
  try {
    mkdirSync(CONDITIONED_DIR, { recursive: true });
    const out = resolve(CONDITIONED_DIR, `${maxEdge}_${basename(imagePath)}`);
    if (!existsSync(out)) {
      execFileSync("sips", ["-Z", String(maxEdge), imagePath, "--out", out], {
        stdio: "ignore",
      });
    }
    return { data: readFileSync(out).toString("base64"), mediaType: "image/jpeg" };
  } catch {
    const media = imagePath.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";
    return { data: readFileSync(imagePath).toString("base64"), mediaType: media };
  }
}
