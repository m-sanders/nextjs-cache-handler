import type { CacheHandlerValue } from "../../handlers/cache-handler.types";

/**
 * Interface for cache value serializers.
 *
 * Serializers control how cache values are converted to/from storage format.
 * This allows for different compression algorithms, encryption, or custom formats.
 */
export interface CacheSerializer {
  /**
   * Unique name for the serializer (e.g., "default", "gzip", "lz4").
   */
  name: string;

  /**
   * Serialize a cache handler value for storage.
   *
   * @param value - The cache value to serialize
   * @returns A string or Buffer representing the serialized value
   */
  serialize(value: CacheHandlerValue): Promise<string | Buffer>;

  /**
   * Deserialize stored data back to a cache handler value.
   *
   * @param data - The serialized data (string or Buffer from Redis)
   * @returns The deserialized cache value, or null if deserialization fails
   */
  deserialize(data: string | Buffer): Promise<CacheHandlerValue | null>;
}
