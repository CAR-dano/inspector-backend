# Redis Cache Setup Guide for Inspector Backend

## Overview

Inspector Backend menggunakan **Upstash Redis** untuk caching blacklist token JWT. Implementasi ini mengurangi beban database dengan menyimpan hasil pengecekan blacklist di cache, sehingga mencegah DB connection pool exhaustion.

## Kenapa Redis Diperlukan?

Setiap request yang membutuhkan autentikasi JWT akan melakukan pengecekan apakah token tersebut sudah di-blacklist. Tanpa caching:
- Setiap request = 1 query database
- 1000 requests/menit = 1000 database queries/menit
- Berpotensi menyebabkan **connection pool exhaustion**

Dengan Redis caching:
- Request pertama = 1 query database + write ke cache
- Request berikutnya = read dari cache (NO database query)
- Performa jauh lebih cepat dan database load berkurang drastis

## Setup Upstash Redis

### 1. Buat Upstash Account

1. Kunjungi [https://upstash.com/](https://upstash.com/)
2. Klik **"Sign Up"** atau **"Get Started"**
3. Login menggunakan GitHub, Google, atau email

### 2. Buat Redis Database

1. Setelah login, klik **"Create Database"**
2. Isi form:
   - **Name**: `inspector-redis` (atau nama lain sesuai keinginan)
   - **Type**: **Regional** (lebih murah dan cukup untuk production)
   - **Region**: Pilih region terdekat dengan server Anda (misal: `ap-southeast-1` untuk Singapore)
   - **Primary Region**: Pilih region yang sama
3. Klik **"Create"**

### 3. Dapatkan Redis URL

Setelah database dibuat:

1. Klik database yang baru saja dibuat
2. Pada tab **"Details"**, cari section **"REST API"** atau **"Connect"**
3. Copy **Redis URL** dengan format:
   ```
   redis://default:XXXXXXXXXXXXXXX@HOSTNAME:PORT
   ```
4. Simpan URL ini untuk digunakan di `.env`

**Contoh Redis URL:**
```
redis://default:AYOxASQgN2I5ZTk5ODEtMWU2Zi00YWI0LWFhMmMtMjA3NTJhMGRmOTI3@pumped-dragon-12345.upstash.io:6379
```

### 4. Konfigurasi Environment Variables

Edit file `.env` dan tambahkan Redis URL:

```bash
# Redis Configuration (Upstash)
REDIS_URL="redis://default:YOUR_PASSWORD@YOUR_HOST:PORT"
```

**Tips Keamanan:**
- ⚠️ **JANGAN commit** file `.env` ke Git
- Simpan Redis URL secara aman (gunakan secret manager untuk production)
- Rotasi password secara berkala jika perlu

## Verifikasi Setup

### 1. Test Koneksi Redis

Setelah menambahkan `REDIS_URL` ke `.env`, jalankan aplikasi:

```bash
npm run start:dev
```

**Expected Logs:**
```
[RedisService] Redis client connecting...
[RedisService] Redis connected successfully
```

Jika koneksi gagal, cek:
- ✅ Apakah `REDIS_URL` valid dan tidak ada typo?
- ✅ Apakah IP server Anda di-whitelist di Upstash? (default: allow all)
- ✅ Apakah firewall memblokir koneksi keluar ke port 6379?

### 2. Test Cache Functionality

1. **Login untuk mendapatkan token:**
   ```bash
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"inspector@example.com","pin":"1234"}'
   ```

2. **Akses protected endpoint (request pertama):**
   ```bash
   curl -X GET http://localhost:3000/inspections \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```
   
   **Expected Log:**
   ```
   [AuthService] Token blacklist check: Redis miss, checking database
   ```

3. **Akses lagi dengan token yang sama (request kedua):**
   ```bash
   curl -X GET http://localhost:3000/inspections \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```
   
   **Expected Log:**
   ```
   [AuthService] Token blacklist check: Redis cache hit
   ```
   
   ✅ Jika log menunjukkan "cache hit", berarti Redis berfungsi dengan baik!

## Configuration Options

### REDIS_URL (Required)

URL koneksi ke Upstash Redis. Format:
```
redis://[username]:[password]@[host]:[port]
```

**Default:** None (Redis disabled jika tidak diset)

### ENABLE_BLACKLIST_CACHE (Optional)

Feature flag untuk enable/disable cache.

**Default:** `true` (jika `REDIS_URL` tersedia)

**Usage:**
```bash
# Disable cache (fallback ke database)
ENABLE_BLACKLIST_CACHE=false
```

### BLACKLIST_CACHE_TTL (Optional)

Time-to-live untuk cache dalam detik.

**Default:** `86400` (24 jam)

**Usage:**
```bash
# Set TTL ke 12 jam
BLACKLIST_CACHE_TTL=43200
```

## Monitoring & Troubleshooting

### Monitor Cache Performance

Enable verbose logging untuk melihat cache hit/miss:

```bash
# Set log level ke verbose
LOG_LEVEL=verbose npm run start:dev
```

**Metrics to watch:**
- Cache hit rate (seharusnya > 90% setelah warm-up)
- Redis connection status
- Database query count (should decrease significantly)

### Common Issues

#### Issue: "REDIS_URL not configured"

**Solution:** Tambahkan `REDIS_URL` ke file `.env`

---

#### Issue: "Redis connection error: ENOTFOUND"

**Possible causes:**
- Hostname salah dalam `REDIS_URL`
- Network/firewall blocking port 6379

**Solution:** 
1. Verifikasi hostname di Upstash dashboard
2. Test koneksi: `telnet YOUR_HOST 6379`

---

#### Issue: "Redis connection failed after 3 retries"

**Possible causes:**
- Password salah
- IP blocked oleh Upstash

**Solution:**
1. Re-copy Redis URL dari Upstash dashboard
2. Cek IP whitelist di Upstash (default: allow all)

---

#### Issue: Cache tidak berfungsi (selalu DB query)

**Debug steps:**
1. Cek log: "Redis connected successfully"
2. Cek log: "Token blacklist check: Redis cache hit/miss"
3. Verify `ENABLE_BLACKLIST_CACHE` tidak di-set ke `false`

## Rollback ke Database-Only

Jika terjadi masalah dengan Redis:

**Option 1: Hapus REDIS_URL**
```bash
# Comment out atau hapus dari .env
# REDIS_URL="redis://..."
```

**Option 2: Disable cache via flag**
```bash
ENABLE_BLACKLIST_CACHE=false
```

Restart service:
```bash
pm2 restart inspector-backend
# atau
npm run start:dev
```

Aplikasi akan otomatis fallback ke database-only mode (behavior sebelum Redis).

## Production Best Practices

1. **Use Upstash Regional atau Global**
   - Regional: lebih murah, single region
   - Global: multi-region replication untuk HA

2. **Monitor Redis metrics**
   - Memory usage
   - Connection count
   - Hit/miss rate

3. **Set appropriate TTL**
   - Default 24 jam sesuai dengan token expiry
   - Bisa disesuaikan berdasarkan kebutuhan

4. **Backup strategy**
   - Redis data bersifat ephemeral (cache)
   - Database tetap source of truth
   - Kehilangan cache tidak fatal (hanya impact performance)

5. **Security**
   - Gunakan TLS (Upstash supports TLS by default)
   - Rotasi password secara berkala
   - Whitelist IP jika memungkinkan

## Cost Estimation (Upstash)

**Free Tier:**
- 10,000 commands/day
- 256 MB storage
- Cocok untuk development/staging

**Pay-as-you-go:**
- $0.20 per 100K commands
- ~1 juta requests/bulan ≈ $2-3/bulan
- Sangat terjangkau untuk production

## Support

Jika mengalami masalah:

1. Cek dokumentasi Upstash: https://docs.upstash.com/redis
2. Cek logs aplikasi untuk error details
3. Contact team development untuk support

---

**Last Updated:** January 2026
**Version:** 1.0.0
