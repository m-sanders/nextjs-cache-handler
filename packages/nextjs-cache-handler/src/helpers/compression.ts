import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import type {
  IncrementalCacheValue,
  CachedRouteValue,
  IncrementalCachedAppPageValue,
} from "next/dist/server/response-cache";
import type { CacheHandlerValue } from "../handlers/cache-handler.types";
import type {
  RedisCompliantCachedRouteValue,
  RedisCompliantCachedAppPageValue,
} from "../handlers/redis-strings.types";
import { convertStringsToBuffers } from "./buffer";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Compresses a cache handler value by gzipping the entire serialized value.
 * Returns a Buffer for native Redis BLOB_STRING storage.
 *
 * @param cacheHandlerValue - The cache value to compress
 * @returns A compressed Buffer
 */
export async function compressValue(
  cacheHandlerValue: CacheHandlerValue,
): Promise<Buffer> {
  const value: IncrementalCacheValue | null = cacheHandlerValue.value;

  if (!value) {
    // No value to compress, serialize as-is
    const serialized = JSON.stringify(cacheHandlerValue);
    return await gzipAsync(serialized);
  }

  // Clone the value to avoid mutation
  const valueClone = JSON.parse(JSON.stringify(cacheHandlerValue));
  const clonedValue = valueClone.value;

  const kind = value?.kind;

  if (kind === "APP_ROUTE") {
    const appRouteValue = value as unknown as CachedRouteValue;
    const appRouteData =
      clonedValue as unknown as RedisCompliantCachedRouteValue;

    if (appRouteValue?.body) {
      // Convert body buffer to base64 for JSON serialization
      appRouteData.body = appRouteValue.body.toString("base64");
    }
  } else if (kind === "APP_PAGE") {
    const appPageValue = value as unknown as IncrementalCachedAppPageValue;
    const appPageData =
      clonedValue as unknown as RedisCompliantCachedAppPageValue;

    if (appPageValue?.rscData) {
      // Convert rscData buffer to base64 for JSON serialization
      appPageData.rscData = appPageValue.rscData.toString("base64");
    }

    if (appPageValue?.segmentData) {
      // Convert each segment buffer to base64 for JSON serialization
      const base64Segments: Record<string, string> = {};
      for (const [key, buffer] of Array.from(
        appPageValue.segmentData.entries(),
      )) {
        base64Segments[key] = buffer.toString("base64");
      }
      appPageData.segmentData = base64Segments;
    }
  }

  // Serialize the entire structure and compress it
  const serialized = JSON.stringify(valueClone);
  return await gzipAsync(serialized);
}

/**
 * Decompresses a cache handler value from a Buffer or string.
 * Automatically detects gzip compression via magic bytes.
 *
 * @param data - The data as Buffer (from Redis with BLOB_STRING) or string (legacy)
 * @returns The decompressed cache handler value
 */
export async function decompressValue(
  data: Buffer | string,
): Promise<CacheHandlerValue | null> {
  if (!data) return null;

  let buffer: Buffer;

  // Handle both Buffer (from BLOB_STRING) and string (fallback)
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else {
    // String data - could be base64-encoded compressed data or JSON
    // Try to detect if it's base64 by attempting to decode
    try {
      buffer = Buffer.from(data, "base64");
    } catch {
      // If base64 decode fails, treat as raw JSON string
      const cacheValue = JSON.parse(data) as CacheHandlerValue | null;
      if (!cacheValue) return null;
      convertStringsToBuffers(cacheValue);
      return cacheValue;
    }
  }

  // Check if buffer is gzipped (magic bytes: 0x1f 0x8b)
  const isGzipped =
    buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;

  try {
    let jsonString: string;

    if (isGzipped) {
      // Decompress the buffer
      const decompressed = await gunzipAsync(buffer);
      jsonString = decompressed.toString("utf-8");
    } else {
      // Not compressed - could be legacy uncompressed JSON string
      jsonString = typeof data === "string" ? data : buffer.toString("utf-8");
    }

    const cacheValue = JSON.parse(jsonString) as CacheHandlerValue | null;
    if (!cacheValue) return null;

    // Convert base64 strings back to buffers
    convertStringsToBuffers(cacheValue);

    return cacheValue;
  } catch (error) {
    // If decompression or parsing fails, log and return null
    console.error("Failed to decompress cache value:", error);
    return null;
  }
}
