import type { CacheHandlerValue } from "../../handlers/cache-handler.types";
import { convertStringsToBuffers, parseBuffersToStrings } from "../buffer";
import type { CacheSerializer } from "./types";

/**
 * Default serializer that converts cache values to JSON strings.
 *
 * This serializer:
 * - Converts Buffer fields to base64 strings before serialization
 * - Stores data as JSON strings in Redis
 * - Converts base64 strings back to Buffers on deserialization
 *
 * This is the default behavior and maintains backward compatibility
 * with existing cache entries.
 */
export const defaultSerializer: CacheSerializer = {
  name: "default",

  async serialize(cacheHandlerValue: CacheHandlerValue): Promise<string> {
    // Clone only the value object to avoid mutating Next.js's original
    const valueForStorage = cacheHandlerValue.value
      ? { ...cacheHandlerValue.value }
      : null;

    if (valueForStorage) {
      parseBuffersToStrings({ ...cacheHandlerValue, value: valueForStorage });
    }

    return JSON.stringify({
      ...cacheHandlerValue,
      value: valueForStorage,
    });
  },

  async deserialize(data: string | Buffer): Promise<CacheHandlerValue | null> {
    if (!data) return null;

    try {
      // Convert Buffer to string if needed
      const jsonString =
        typeof data === "string" ? data : data.toString("utf-8");

      const cacheValue = JSON.parse(jsonString) as CacheHandlerValue | null;

      if (!cacheValue) return null;

      // Convert base64 strings back to Buffers
      convertStringsToBuffers(cacheValue);

      return cacheValue;
    } catch (error) {
      console.error("Failed to deserialize cache value:", error);
      return null;
    }
  },
};
