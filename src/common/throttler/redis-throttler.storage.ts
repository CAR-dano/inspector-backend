import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../../redis/redis.service';

export interface ThrottlerStorageRecord {
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
    constructor(private readonly redisService: RedisService) { }

    async increment(
        key: string,
        ttl: number, // In milliseconds
        limit: number,
        blockDuration: number,
        throttlerName: string,
    ): Promise<ThrottlerStorageRecord> {
        const client = this.redisService.getClient();
        const storageKey = `throttler:${key}`;

        // Lua script to atomically increment and ensure TTL is set
        const script = `
      var hits = redis.call('INCR', KEYS[1])
      var ttl = redis.call('PTTL', KEYS[1])
      
      -- If key was just created or has no TTL, set it
      if ttl == -1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
        ttl = ARGV[1]
      end
      
      return {hits, ttl}
    `;

        // Execution
        const result = (await client.eval(script, 1, storageKey, ttl)) as [number, number];
        const [hits, ttlRemaining] = result;

        return {
            totalHits: hits,
            timeToExpire: Math.max(0, ttlRemaining),
            isBlocked: false, // Basic implementation does not enforce blocking at storage level
            timeToBlockExpire: 0,
        };
    }
}
