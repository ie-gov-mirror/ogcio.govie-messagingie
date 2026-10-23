# Caching Strategy in messaging-next

This document explains the comprehensive caching strategy implemented in the messaging-next application, including what is cached, when it's cached, how long it's cached, and how cache invalidation works.

## Table of Contents

1. [Overview](#overview)
2. [Cache Types](#cache-types)
3. [Server-Side Caching](#server-side-caching)
4. [Client-Side Caching (SWR)](#client-side-caching-swr)
5. [Cache Lifecycle](#cache-lifecycle)
6. [Cache Invalidation](#cache-invalidation)
7. [Configuration](#configuration)
8. [Best Practices](#best-practices)

---

## Overview

The messaging-next application uses multiple caching layers to optimize performance:
- **Server-Side Caching**: Next.js Cache Components with `cacheTag()` and `cacheLife()`
- **Client-Side Caching**: SWR (stale-while-revalidate) for dynamic data
- **Fetch Caching**: HTTP fetch requests with `force-cache` strategy
- **Component Caching**: Layout and page component caching

### Cache Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User Request                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Layout Component Cache (cacheLife)                         │
│  - Stale: 5 minutes                                         │
│  - Revalidate: 10 minutes                                   │
│  - Expire: 15 minutes                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Data Fetching (Service Functions)                         │
│  - "use cache" directive                                    │
│  - cacheTag("messages") or cacheTag("message")              │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                            │
        ▼                            ▼
┌───────────────┐          ┌──────────────────┐
│  API Route    │          │  Direct Data      │
│  (force-cache)│          │  (no API route)   │
└───────┬───────┘          └───────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Client-Side (SWR)                                         │
│  - Automatic revalidation                                 │
│  - Request deduplication                                   │
│  - Stale-while-revalidate                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Cache Types

### 1. Server-Side Cache Components

**Location**: All service functions in `/src/services/messages.ts`

**Mechanism**: Next.js Cache Components API

**What is Cached**:
- Function execution results
- API responses
- Direct data imports

**How It Works**:
```typescript
export async function getMessages() {
  "use cache" // Enables caching for this function
  cacheTag("messages") // Tags cache for invalidation
  // ... function logic
}
```

### 2. Layout Component Cache

**Location**: `/src/app/[locale]/layout.tsx`

**Mechanism**: `cacheLife()` directive

**What is Cached**:
- Layout component render
- Locale validation
- Navigation structure

**Configuration**:
```typescript
"use cache"
cacheLife({
  stale: 5 * 60 * 1000, // 5 minutes - cache is fresh
  revalidate: 10 * 60 * 1000, // 10 minutes - background revalidation
  expire: 15 * 60 * 1000, // 15 minutes - cache expires
})
```

### 3. Fetch Cache

**Location**: Service functions calling API routes

**Mechanism**: HTTP fetch with `cache: "force-cache"`

**What is Cached**:
- API route responses
- HTTP request/response pairs

**Configuration**:
```typescript
const response = await fetch(`http://localhost:3000/api/messages`, {
  cache: "force-cache", // Uses Next.js fetch cache
})
```

### 4. Client-Side SWR Cache

**Location**: `/src/hooks/use-fetch.ts` and client components

**Mechanism**: SWR (stale-while-revalidate) library

**What is Cached**:
- API responses in browser memory
- Request deduplication
- Automatic revalidation

---

## Server-Side Caching

### Cache Tags

Cache tags are used to group related cache entries for invalidation. The application uses two main cache tags:

#### `"messages"` Tag

**Used By**:
- `getMessagesWithAPI()` - Fetches all messages via API
- `getMessages()` - Fetches all messages directly

**When Cached**:
- First request caches the result
- Subsequent requests use cached data
- Cache persists until invalidated

**Cache Duration**: Indefinite (until invalidated via `revalidateTag("messages")`)

**Example**:
```typescript
export async function getMessages() {
  "use cache"
  cacheTag("messages") // Tagged for invalidation
  await simulateWork()
  return { data: (await import("@/mock/messages.json")).default }
}
```

#### `"message"` Tag

**Used By**:
- `getMessageWithAPI(id)` - Fetches single message via API
- `getMessage(id)` - Fetches single message directly

**When Cached**:
- Cached per message ID
- Each unique ID has its own cache entry
- Cache persists until invalidated

**Cache Duration**: Indefinite (until invalidated via `revalidateTag("message")`)

**Example**:
```typescript
export async function getMessage(id: string) {
  "use cache"
  cacheTag("message") // Tagged for invalidation
  // ... fetch logic
}
```

### Cache Life Stages

The layout component uses a three-stage cache lifecycle:

#### Stage 1: Fresh (0-5 minutes)

- Cache is considered **fresh**
- Requests return cached data immediately
- No revalidation occurs
- **Duration**: 5 minutes

#### Stage 2: Stale (5-10 minutes)

- Cache is considered **stale** but still usable
- Requests return cached data immediately
- Background revalidation may occur
- **Duration**: 5 minutes (from 5 to 10 minutes)

#### Stage 3: Revalidation (10-15 minutes)

- Cache is **revalidating** in the background
- Requests return stale data while revalidating
- New data is fetched and cached
- **Duration**: 5 minutes (from 10 to 15 minutes)

#### Stage 4: Expired (15+ minutes)

- Cache has **expired**
- Next request triggers fresh data fetch
- New cache entry is created
- **Duration**: Indefinite (until next request)

### Cache Storage

Server-side caches are stored in:
- **Development**: In-memory cache (cleared on server restart)
- **Production**: Persistent cache (survives deployments on Vercel)

---

## Client-Side Caching (SWR)

### SWR Configuration

**Location**: `/src/hooks/use-fetch.ts`

**Default Behavior**:
- Automatic request deduplication
- Stale-while-revalidate strategy
- Error retry on focus
- Automatic revalidation on window focus

**What is Cached**:
- API responses in browser memory
- Keyed by URL (e.g., `/api/messages`, `/api/messages/123`)

**Cache Duration**:
- **Stale Time**: Data is considered fresh immediately after fetch
- **Revalidation**: Automatic on:
  - Window focus
  - Network reconnect
  - Interval (if configured)
  - Manual trigger

### SWR Cache Lifecycle

```
Request → Check Cache → [Cache Hit?]
                           │
        ┌──────────────────┴──────────────────┐
        │                                      │
     Yes (Stale)                            No
        │                                      │
        ▼                                      ▼
Return Cached Data                    Fetch from API
        │                                      │
        │                                      ▼
        │                              Cache Response
        │                                      │
        └──────────────┬──────────────────────┘
                       │
                       ▼
            Background Revalidation
                       │
                       ▼
            Update Cache if Changed
```

### SWR Features

1. **Request Deduplication**
   - Multiple components requesting the same URL share one request
   - Reduces network traffic

2. **Stale-While-Revalidate**
   - Shows cached data immediately
   - Fetches fresh data in background
   - Updates UI when new data arrives

3. **Automatic Revalidation**
   - Revalidates on window focus
   - Revalidates on network reconnect
   - Can be configured with intervals

4. **Error Handling**
   - Automatic retry on failure
   - Configurable retry strategies

---

## Cache Lifecycle

### Server-Side Cache Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│  Request 1 (t=0)                                         │
│  - Cache miss                                            │
│  - Fetch data                                            │
│  - Store in cache (tagged)                               │
│  - Return data                                           │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Request 2-∞ (t=0-5min)                                 │
│  - Cache hit (fresh)                                     │
│  - Return cached data immediately                       │
│  - No revalidation                                       │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Request N (t=5-10min)                                   │
│  - Cache hit (stale)                                     │
│  - Return cached data immediately                        │
│  - Optional background revalidation                     │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Request M (t=10-15min)                                  │
│  - Cache hit (revalidating)                              │
│  - Return stale data                                    │
│  - Background revalidation in progress                   │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Request P (t=15+min)                                    │
│  - Cache expired                                         │
│  - Fetch fresh data                                      │
│  - Store in cache                                        │
│  - Return data                                           │
└─────────────────────────────────────────────────────────┘
```

### Client-Side Cache Lifecycle (SWR)

```
┌─────────────────────────────────────────────────────────┐
│  Component Mount                                         │
│  - Check SWR cache                                       │
│  - [Cache miss] → Fetch → Cache → Render                │
│  - [Cache hit] → Render immediately                      │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Window Focus / Network Reconnect                       │
│  - Revalidate in background                             │
│  - Update cache if changed                               │
│  - Re-render if data changed                            │
└─────────────────────────────────────────────────────────┘
```

---

## Cache Invalidation

### Server-Side Cache Invalidation

#### Method 1: Cache Tags

Invalidate all caches with a specific tag:

```typescript
import { revalidateTag } from "next/cache"

// Invalidate all "messages" caches
revalidateTag("messages")

// Invalidate all "message" caches
revalidateTag("message")
```

**When to Use**:
- After creating/updating/deleting messages
- After bulk operations
- Manual cache refresh

**Example Implementation** (not currently in codebase, but recommended):

```typescript
// In an API route or Server Action
export async function POST(request: Request) {
  // ... create/update message logic

  // Invalidate cache
  revalidateTag("messages")
  revalidateTag("message")

  return Response.json({ success: true })
}
```

#### Method 2: Cache Life Expiration

Caches automatically expire based on `cacheLife()` configuration:
- **Layout cache**: Expires after 15 minutes
- **Service function caches**: Expire when manually invalidated or on deployment

#### Method 3: Path-Based Revalidation

Revalidate specific routes:

```typescript
import { revalidatePath } from "next/cache"

// Revalidate specific page
revalidatePath("/messages")
revalidatePath("/messages/[id]", "page")
```

### Client-Side Cache Invalidation (SWR)

#### Method 1: Manual Revalidation

```typescript
import { mutate } from "swr"

// Revalidate specific URL
mutate("/api/messages")

// Revalidate all caches
mutate(() => true)
```

#### Method 2: Automatic Revalidation

SWR automatically revalidates on:
- Window focus
- Network reconnect
- Interval (if configured)

#### Method 3: Optimistic Updates

```typescript
// Update cache optimistically
mutate("/api/messages", newData, false)

// Then revalidate
mutate("/api/messages")
```

---

## Configuration

### Next.js Configuration

**File**: `next.config.ts`

```typescript
const nextConfig: NextConfig = {
  cacheComponents: true, // Enables Cache Components API
  // ... other config
}
```

### Layout Cache Configuration

**File**: `/src/app/[locale]/layout.tsx`

```typescript
cacheLife({
  stale: 5 * 60 * 1000, // 5 minutes
  revalidate: 10 * 60 * 1000, // 10 minutes
  expire: 15 * 60 * 1000, // 15 minutes
})
```

**Current Settings**:
- **Stale**: 5 minutes (300,000 ms)
- **Revalidate**: 10 minutes (600,000 ms)
- **Expire**: 15 minutes (900,000 ms)

### Service Function Cache Configuration

**File**: `/src/services/messages.ts`

All service functions use:
- `"use cache"` directive
- `cacheTag()` for tagging
- `cache: "force-cache"` for fetch requests

### SWR Configuration

**File**: `/src/hooks/use-fetch.ts`

Currently uses default SWR configuration. Can be enhanced with:

```typescript
import { SWRConfig } from "swr"

// Global SWR configuration
<SWRConfig
  value={{
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
    focusThrottleInterval: 5000,
  }}
>
  {children}
</SWRConfig>
```

---

## What is Cached

### Server-Side

| Resource            | Cache Tag    | Duration   | Invalidation             |
| ------------------- | ------------ | ---------- | ------------------------ |
| Layout component    | N/A          | 15 minutes | Automatic expiration     |
| All messages list   | `"messages"` | Indefinite | Manual (`revalidateTag`) |
| Single message      | `"message"`  | Indefinite | Manual (`revalidateTag`) |
| API route responses | N/A          | Indefinite | Manual or deployment     |

### Client-Side

| Resource             | Cache Key | Duration           | Invalidation                    |
| -------------------- | --------- | ------------------ | ------------------------------- |
| `/api/messages`      | URL       | Until revalidation | Window focus, network reconnect |
| `/api/messages/[id]` | URL       | Until revalidation | Window focus, network reconnect |

---

## When Caching Occurs

### Server-Side Caching

1. **First Request**:
   - Cache miss
   - Data fetched
   - Stored in cache
   - Returned to client

2. **Subsequent Requests** (within cache lifetime):
   - Cache hit
   - Cached data returned immediately
   - No data fetching

3. **After Expiration**:
   - Cache expired
   - Fresh data fetched
   - Cache updated
   - Returned to client

### Client-Side Caching (SWR)

1. **Component Mount**:
   - Check SWR cache
   - If cache hit: return cached data
   - If cache miss: fetch and cache

2. **Window Focus**:
   - Automatic revalidation
   - Update cache if changed

3. **Network Reconnect**:
   - Automatic revalidation
   - Update cache if changed

---

## Best Practices

### Server-Side Caching

1. **Use Cache Tags Strategically**

   ```typescript
   // Group related data
   cacheTag("messages")      // All messages
   cacheTag("message")        // Individual messages
   cacheTag("user-messages")  // User-specific messages
   ```

2. **Set Appropriate Cache Life**

   ```typescript
   // For frequently changing data
   cacheLife({ stale: 1 * 60 * 1000, revalidate: 5 * 60 * 1000 })
      // For rarely changing data
   cacheLife({ stale: 60 * 60 * 1000, revalidate: 120 * 60 * 1000 })
   ```

3. **Invalidate on Mutations**

   ```typescript
   // Always invalidate after mutations
   await createMessage(data)
   revalidateTag("messages")
   ```

4. **Use Fetch Cache for API Routes**

   ```typescript
   // Cache API responses
   fetch(url, { cache: "force-cache" })
   ```

### Client-Side Caching (SWR)

1. **Use Consistent Cache Keys**

   ```typescript
   // Good: Consistent keys
   useFetch("/api/messages")
      // Bad: Dynamic keys without memoization
   useFetch(`/api/messages?page=${page}`)  // Creates new cache entry each time
   ```

2. **Handle Loading and Error States**

   ```typescript
   const { data, error, isLoading } = useFetch(url)
      if (isLoading) return <Loading />
   if (error) return <Error />
   return <Data data={data} />
   ```

3. **Use Optimistic Updates**

   ```typescript
   // Update UI immediately, then sync with server
   mutate("/api/messages", newData, false)
   await updateMessage(newData)
   mutate("/api/messages")  // Revalidate
   ```

4. **Configure Revalidation Intervals**

   ```typescript
   // For real-time data
   useSWR(url, fetcher, { refreshInterval: 1000 })
   ```

---

## Cache Debugging

### Checking Cache Status

1. **Server-Side**:
   - Check Next.js build output for cache information
   - Use `next dev` with verbose logging
   - Monitor cache hits/misses in production

2. **Client-Side (SWR)**:
   - Use SWR DevTools browser extension
   - Check browser DevTools Network tab
   - Monitor SWR cache in React DevTools

### Common Issues

1. **Stale Data**:
   - Check cache tags are being invalidated
   - Verify `cacheLife()` expiration times
   - Ensure `revalidateTag()` is called after mutations

2. **Cache Not Working**:
   - Verify `"use cache"` directive is present
   - Check `cacheComponents: true` in `next.config.ts`
   - Ensure functions are async and return promises

3. **SWR Not Caching**:
   - Verify URL is consistent
   - Check SWR configuration
   - Ensure fetcher function is provided

---

## Summary

The messaging-next application implements a comprehensive multi-layer caching strategy:
- **Server-Side**: Next.js Cache Components with tags and lifecycle management
- **Client-Side**: SWR for dynamic, interactive data fetching
- **Duration**: Varies by cache type (5-15 minutes for layout, indefinite for data until invalidated)
- **Invalidation**: Manual via tags, automatic via expiration, or automatic via SWR revalidation

This strategy ensures optimal performance while maintaining data freshness and providing excellent user experience.
