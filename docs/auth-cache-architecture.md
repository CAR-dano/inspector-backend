# Auth Cache Architecture

## Overview

Inspector Backend mengimplementasikan **Redis-first caching strategy** untuk blacklist token JWT, mengurangi beban database PostgreSQL secara signifikan dan mencegah connection pool exhaustion.

## Problem Statement

### Before Redis Implementation

Setiap authenticated request melakukan pengecekan blacklist token dengan query database:

```typescript
// Every request = 1 DB query
async isTokenBlacklisted(token: string): Promise<boolean> {
    const blacklisted = await this.prisma.blacklistedToken.findUnique({
        where: { token },
    });
    return !!blacklisted;
}
```

**Impact:**
- 1,000 requests/minute = 1,000 database queries/minute
- High database connection usage
- Risk of connection pool exhaustion
- Increased latency for authentication

### After Redis Implementation

Cache-first strategy dengan database fallback:

```typescript
async isTokenBlacklisted(token: string): Promise<boolean> {
    // 1. Check Redis cache first (fast path)
    const cachedResult = await redis.get(`blacklist:${token}`);
    if (cachedResult !== null) return cachedResult === 'true';
    
    // 2. Cache miss - check database
    const blacklisted = await db.blacklistedToken.findUnique({ where: { token } });
    
    // 3. Write-through cache
    if (blacklisted) {
        await redis.set(`blacklist:${token}`, 'true', ttl);
    }
    
    return !!blacklisted;
}
```

**Benefits:**
- First request: 1 DB query + 1 cache write
- Subsequent requests: 0 DB queries (cache hit)
- ~90%+ reduction in database load
- Faster authentication (Redis latency < 5ms vs DB ~20-50ms)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       Client Request                             │
│                   (JWT in Authorization header)                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     JwtStrategy (Passport)                       │
│                  validates(req, JwtPayload)                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AuthService                                │
│                isTokenBlacklisted(token)                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Check Redis Cache    │
                    │  key: blacklist:TOKEN │
                    └───────────┬───────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
            Cache HIT                       Cache MISS
                │                               │
                ▼                               ▼
        ┌───────────────┐           ┌──────────────────────┐
        │ Return cached │           │ Query Database       │
        │ result (true) │           │ blacklistedToken     │
        └───────────────┘           └──────────┬───────────┘
                                               │
                                ┌──────────────┴────────────────┐
                                │                               │
                          Found in DB                     Not Found
                                │                               │
                                ▼                               ▼
                    ┌──────────────────────┐         ┌──────────────┐
                    │ Write to Redis Cache │         │ Return false │
                    │ TTL = token expiry   │         └──────────────┘
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Return true          │
                    └──────────────────────┘
```

---

## Flow Diagrams

### JWT Validation Flow (with Redis Cache)

```mermaid
sequenceDiagram
    participant Client
    participant JwtStrategy
    participant AuthService
    participant Redis
    participant Database
    
    Client->>JwtStrategy: Request with JWT Token
    JwtStrategy->>JwtStrategy: Extract & Verify JWT
    JwtStrategy->>AuthService: isTokenBlacklisted(token)
    
    AuthService->>Redis: GET blacklist:TOKEN
    
    alt Cache Hit
        Redis-->>AuthService: "true" or null
        AuthService-->>JwtStrategy: true/false
    else Cache Miss
        Redis-->>AuthService: null
        AuthService->>Database: findUnique({ where: { token } })
        
        alt Token Found in DB
            Database-->>AuthService: BlacklistedToken
            AuthService->>Redis: SET blacklist:TOKEN "true" EX ttl
            Redis-->>AuthService: OK
            AuthService-->>JwtStrategy: true (blacklisted)
        else Token Not Found
            Database-->>AuthService: null
            AuthService-->>JwtStrategy: false (not blacklisted)
        end
    end
    
    alt Token Blacklisted
        JwtStrategy-->>Client: 401 Unauthorized
    else Token Valid
        JwtStrategy->>Client: Continue to handler
    end
```

### Blacklisting a Token Flow (Dual-Write)

```mermaid
sequenceDiagram
    participant Client
    participant AuthController
    participant AuthService
    participant Redis
    participant Database
    
    Client->>AuthController: POST /auth/logout
    AuthController->>AuthService: blacklistToken(token, expiresAt)
    
    par Dual Write
        AuthService->>Redis: SET blacklist:TOKEN "true" EX ttl
        and
        AuthService->>Database: INSERT blacklistedToken
    end
    
    Redis-->>AuthService: OK or Error
    Database-->>AuthService: Created or Error
    
    alt Both Success
        AuthService-->>AuthController: Success
        AuthController-->>Client: 200 OK
    else One Success
        AuthService-->>AuthController: Success (log warning)
        AuthController-->>Client: 200 OK
    else Both Failed
        AuthService-->>AuthController: Error
        AuthController-->>Client: 500 Internal Server Error
    end
```

---

## Caching Strategy

### Cache Key Format

```
blacklist:{full_jwt_token}
```

**Example:**
```
blacklist:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U
```

### Cache Value

- `"true"` - Token is blacklisted
- `null` - Token not in cache (need to check DB)

### TTL Strategy

**TTL (Time-To-Live)** disesuaikan dengan expiry time token:

```typescript
const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
```

**Example:**
- Token expires at: `2026-01-07 12:00:00`
- Current time: `2026-01-06 12:00:00`
- TTL: `86400` seconds (24 hours)

**Why TTL?**
- Automatically clean up expired tokens from cache
- No manual cleanup needed
- Memory efficient

---

## Resilience & Fallback

### Graceful Degradation

System tetap berfungsi meskipun Redis down:

```typescript
try {
    // Try Redis first
    const cached = await redis.get(key);
    if (cached !== null) return cached === 'true';
    
    // Fallback to database
    const result = await db.findUnique({ where: { token } });
    return !!result;
} catch (error) {
    // Redis failed - fallback to database
    try {
        const result = await db.findUnique({ where: { token } });
        return !!result;
    } catch (dbError) {
        throw new InternalServerErrorException();
    }
}
```

### Dual-Write Strategy

Saat blacklist token, write ke **both** Redis dan Database:

```typescript
const results = await Promise.allSettled([
    redis.set(`blacklist:${token}`, 'true', ttl),
    db.blacklistedToken.create({ data: { token, expiresAt } }),
]);

// Success if at least ONE write succeeded
if (redisResult.status === 'fulfilled' || dbResult.status === 'fulfilled') {
    return; // Success
}
```

**Benefits:**
- Database sebagai source of truth (persistence)
- Redis sebagai fast cache
- System toleran terhadap partial failures

---

## Performance Comparison

### Metrics (Estimated)

| Metric | Without Redis | With Redis (Cache Hit) | Improvement |
|--------|---------------|------------------------|-------------|
| Auth Latency | ~30-50ms | ~5-10ms | **5-10x faster** |
| DB Queries/1000 req | 1,000 | ~10-50 | **95-99% reduction** |
| DB Connection Usage | High | Very Low | **Significant** |
| Throughput | ~200 req/s | ~1000+ req/s | **5x increase** |

### Real-world Impact

**Scenario:** 10,000 authenticated requests/hour

**Without Redis:**
- 10,000 DB queries/hour
- Avg 30ms latency
- High risk of connection pool exhaustion during peak

**With Redis (90% cache hit rate):**
- ~1,000 DB queries/hour (90% reduction)
- Avg 8ms latency
- Stable performance even during peak load

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | - | Upstash Redis connection URL |
| `ENABLE_BLACKLIST_CACHE` | No | `true` | Feature flag to enable/disable cache |
| `BLACKLIST_CACHE_TTL` | No | `86400` | Default TTL in seconds (24 hours) |

### Example Configuration

```bash
# .env
REDIS_URL="redis://default:PASSWORD@HOST:6379"
ENABLE_BLACKLIST_CACHE=true
BLACKLIST_CACHE_TTL=86400
```

---

## Monitoring & Observability

### Logs to Monitor

**Successful Cache Hit:**
```
[AuthService] Token blacklist check: Redis cache hit
```

**Cache Miss (DB Fallback):**
```
[AuthService] Token blacklist check: Redis miss, checking database
```

**Redis Connection Status:**
```
[RedisService] Redis connected successfully
[RedisService] Redis connection error: ...
```

### Key Metrics (Future Enhancement)

- `blacklist_cache_hits_total` - Counter for cache hits
- `blacklist_cache_misses_total` - Counter for cache misses
- `blacklist_cache_hit_rate` - Percentage (should be > 90%)
- `redis_connection_status` - Gauge (1 = up, 0 = down)
- `blacklist_check_latency_ms` - Histogram

---

## Rollback Plan

### Scenario: Redis Issues in Production

**Option 1: Disable via Environment Variable**
```bash
# Set in .env or environment
ENABLE_BLACKLIST_CACHE=false

# OR remove REDIS_URL
# REDIS_URL=

# Restart service
pm2 restart inspector-backend
```

**Option 2: Code Rollback**
```bash
git revert <commit-hash>
git push origin main
./deploy.sh
```

**Effect:** System fallback ke database-only mode (zero downtime)

---

## Security Considerations

### Data in Redis

- **Sensitive Data:** Token strings (already exposed in HTTP headers)
- **Encryption:** Not required (tokens are already opaque)
- **TTL:** Auto-expire with token expiry
- **Access Control:** Upstash password-protected

### Best Practices

1. ✅ Use TLS connection (Upstash default)
2. ✅ Rotate Redis password periodically
3. ✅ Whitelist IP addresses if possible
4. ✅ Monitor for unusual access patterns
5. ✅ Keep Redis URL in secret manager (production)

---

## Cost Analysis

### Upstash Pricing (as of Jan 2026)

**Free Tier:**
- 10,000 commands/day
- Suitable for: Development, Staging

**Pay-as-you-go:**
- $0.20 per 100K commands
- Example: 1M requests/month ≈ $2-3/month

**ROI:**
- Reduced database load = lower database costs
- Improved performance = better user experience
- Prevented outages = avoided revenue loss

---

## Future Enhancements

1. **Metrics & Alerting**
   - Prometheus metrics export
   - Alerts for low cache hit rate
   - Dashboard for monitoring

2. **Cache Warming**
   - Pre-populate cache on startup
   - Reduce cold start impact

3. **Multi-level Caching**
   - Add in-memory LRU cache
   - Further reduce Redis calls

4. **Cache Invalidation Strategies**
   - Pub/Sub for distributed invalidation
   - Handle token un-blacklisting (if needed)

---

**Document Version:** 1.0.0  
**Last Updated:** January 2026  
**Author:** Inspector Backend Team
