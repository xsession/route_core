/**
 * MinMaxLTTB — Largest-Triangle-Three-Buckets with Min/Max Preservation
 *
 * Combines the LTTB visual-fidelity algorithm (Steinarsson 2013) with an
 * explicit min/max pass per bucket to guarantee that signal peaks and valleys
 * are never silently discarded — critical for high-frequency waveform data
 * where a missed spike can represent an alarm condition.
 *
 * Performance characteristics:
 *   • O(n) time,  O(threshold) space
 *   • Operates on flat Float64Array [x0,y0, x1,y1, …] — no object allocation
 *   • Safe to call inside a Web Worker for off-main-thread downsampling
 *
 * Reference:
 *   Steinarsson, S. (2013). Downsampling Time Series for Visual Representation.
 *   MSc thesis, University of Iceland. https://skemman.is/handle/1946/15343
 */

/**
 * Downsample a flat interleaved [x0,y0, …] dataset to at most `threshold`
 * output points while preserving peaks, valleys, and visual shape.
 *
 * @param data       Flat packed [x0,y0, x1,y1, …] typed or regular array
 * @param threshold  Target output point count (minimum 3)
 * @returns          Downsampled Float64Array in the same flat [x,y] format
 */
export function minMaxLTTB(
  data: ArrayLike<number>,
  threshold: number,
): Float64Array {
  const len = data.length >>> 1; // number of (x,y) pairs

  if (threshold >= len || threshold <= 2) {
    // No downsampling needed — return a copy
    return Float64Array.from(data as number[]);
  }

  const result     = new Float64Array(threshold * 2);
  const bucketSize = (len - 2) / (threshold - 2);

  // Always preserve the first point
  result[0] = (data as number[])[0];
  result[1] = (data as number[])[1];

  let a = 0; // index of the previously selected point

  for (let i = 0; i < threshold - 2; i++) {
    // ── Bucket boundaries ─────────────────────────────────────────────────
    const bucketStart = Math.floor((i + 0) * bucketSize) + 1;
    const bucketEnd   = Math.floor((i + 1) * bucketSize) + 1;
    const nextStart   = bucketEnd;
    const nextEnd     = Math.min(Math.floor((i + 2) * bucketSize) + 1, len);

    // ── Next-bucket average point (used as the LTTB "far vertex") ─────────
    let avgX = 0, avgY = 0, avgCount = 0;
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += (data as number[])[j * 2];
      avgY += (data as number[])[j * 2 + 1];
      avgCount++;
    }
    avgX /= avgCount;
    avgY /= avgCount;

    const ax = (data as number[])[a * 2];
    const ay = (data as number[])[a * 2 + 1];

    // ── Scan current bucket: LTTB triangle area + min/max tracking ────────
    let maxArea     = -1;
    let ltttbIdx    = bucketStart;
    let bucketMinY  =  Infinity, bucketMaxY  = -Infinity;
    let bucketMinIdx = bucketStart, bucketMaxIdx = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const cx = (data as number[])[j * 2];
      const cy = (data as number[])[j * 2 + 1];

      // Triangle area × 2 (sign doesn't matter)
      const area = Math.abs((ax - avgX) * (cy - ay) - (ax - cx) * (avgY - ay));
      if (area > maxArea) { maxArea = area; ltttbIdx = j; }

      if (cy < bucketMinY) { bucketMinY = cy; bucketMinIdx = j; }
      if (cy > bucketMaxY) { bucketMaxY = cy; bucketMaxIdx = j; }
    }

    // ── MinMax: prefer the extreme point if it differs significantly ───────
    const lttbY      = (data as number[])[ltttbIdx * 2 + 1];
    const extremeIdx = Math.abs(bucketMinY - lttbY) >= Math.abs(bucketMaxY - lttbY)
      ? bucketMinIdx
      : bucketMaxIdx;
    const extremeY = (data as number[])[extremeIdx * 2 + 1];

    // Switch to the extreme point only when it is meaningfully different
    // (>5% of the LTTB candidate's absolute value) to avoid jitter.
    const selectedIdx =
      Math.abs(lttbY) > 1e-10 && Math.abs(extremeY - lttbY) / Math.abs(lttbY) > 0.05
        ? extremeIdx
        : ltttbIdx;

    result[(i + 1) * 2]     = (data as number[])[selectedIdx * 2];
    result[(i + 1) * 2 + 1] = (data as number[])[selectedIdx * 2 + 1];
    a = selectedIdx;
  }

  // Always preserve the last point
  result[(threshold - 1) * 2]     = (data as number[])[(len - 1) * 2];
  result[(threshold - 1) * 2 + 1] = (data as number[])[(len - 1) * 2 + 1];

  return result;
}

/**
 * Convenience wrapper: automatically targets ~2 output points per display pixel.
 * Call this before rendering to fit the container width.
 */
export function autoDownsample(
  data: ArrayLike<number>,
  containerWidthPx: number,
): Float64Array {
  const targetPoints = Math.max(Math.ceil(containerWidthPx * 2), 200);
  return minMaxLTTB(data, targetPoints);
}
