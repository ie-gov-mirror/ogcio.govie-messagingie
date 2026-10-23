# Data Fetching Patterns in Next.js

This document explains the three different data fetching patterns implemented in this application, their use cases, and best practices.

## Table of Contents

1. [SSR with API Routes (`/messages`)](#1-ssr-with-api-routes-messages)
2. [SSR without API Routes (`/messages-no-api`)](#2-ssr-without-api-routes-messages-no-api)
3. [Client-Side Fetching with SWR (`/messages-swr`)](#3-client-side-fetching-with-swr-messages-swr)
4. [Comparison Table](#comparison-table)
5. [When to Use Each Pattern](#when-to-use-each-pattern)

---

## 1. SSR with API Routes (`/messages`)

### Overview

This pattern uses **Server-Side Rendering (SSR)** where the server component fetches data by calling an internal API route. The data is fetched on the server during the request, and the fully rendered HTML is sent to the client.

### How It Works

```
User Request → Server Component → API Route → Database/Mock Data → Server Component → Rendered HTML → Client
```

1. **Page Component** (`/app/[locale]/messages/page.tsx`):
   - Server component that calls `getMessagesWithAPI()`
   - Wraps the data fetching in a `Suspense` boundary
   - Uses React's `use()` hook to unwrap the promise

2. **Service Function** (`/services/messages.ts`):
   - `getMessagesWithAPI()` fetches from `/api/messages`
   - Uses Next.js cache directives: `"use cache"` and `cacheTag()`
   - Implements error handling for failed requests

3. **API Route** (`/app/api/messages/route.ts`):
   - Handles the HTTP request
   - Returns JSON data
   - Can be called independently or by server components

### Code Example

```tsx
// Page Component
export default function Page({ params }: PageProps<"/[locale]/messages">) {
  const { locale } = use(params)
  setRequestLocale(locale)

  return (
    <>
      <h1>{t("title")}</h1>
      <Suspense fallback={<MessagesLoading />}>
        <MessagesComponent
          messages={getMessagesWithAPI()}
          basePath='/messages'
        />
      </Suspense>
    </>
  )
}

// Service Function
export async function getMessagesWithAPI() {
  "use cache"
  cacheTag("messages")
  const response = await fetch(`http://localhost:3000/api/messages`, {
    cache: "force-cache",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`)
  }

  return response.json()
}
```

### Key Features

- ✅ **SEO Friendly**: Content is rendered on the server
- ✅ **Fast Initial Load**: HTML is ready immediately
- ✅ **API Reusability**: API routes can be used by other clients
- ✅ **Caching**: Uses Next.js cache directives for performance
- ✅ **Error Handling**: Proper error boundaries and try-catch blocks

### Best Practices

1. **Use Suspense Boundaries**: Wrap async data fetching in Suspense for better loading states
2. **Extract Loading Components**: Prevent re-creation on each render
3. **Cache Strategically**: Use `cacheTag()` and `cacheLife()` for cache invalidation
4. **Error Handling**: Always handle API errors gracefully
5. **Type Safety**: Use TypeScript for type-safe data fetching

### Trade-offs

- ⚠️ **Extra Network Hop**: Server → API Route → Data (adds latency)
- ⚠️ **More Complex**: Requires both server component and API route
- ⚠️ **Server Load**: All requests hit the server

---

## 2. SSR without API Routes (`/messages-no-api`)

### Overview

This pattern uses **Server-Side Rendering (SSR)** where the server component fetches data directly from the data source (database, file system, etc.) without going through an API route. This is the most direct and efficient SSR pattern.

### How It Works

```
User Request → Server Component → Data Source → Server Component → Rendered HTML → Client
```

1. **Page Component** (`/app/[locale]/messages-no-api/page.tsx`):
   - Server component that calls `getMessages()` directly
   - Wraps the data fetching in a `Suspense` boundary
   - Uses React's `use()` hook to unwrap the promise

2. **Service Function** (`/services/messages.ts`):
   - `getMessages()` directly imports from mock data or database
   - Uses Next.js cache directives: `"use cache"` and `cacheTag()`
   - No HTTP overhead - direct data access

### Code Example

```tsx
// Page Component
export default function Page({
  params,
}: PageProps<"/[locale]/messages-no-api">) {
  const { locale } = use(params)
  setRequestLocale(locale)

  return (
    <>
      <h1>{t("title")}</h1>
      <Suspense fallback={<MessagesLoading />}>
        <MessagesComponent
          messages={getMessages()}
          basePath='/messages-no-api'
        />
      </Suspense>
    </>
  )
}

// Service Function
export async function getMessages() {
  "use cache"
  cacheTag("messages")
  await simulateWork() // Simulates database query
  return { data: (await import("@/mock/messages.json")).default }
}
```

### Key Features

- ✅ **SEO Friendly**: Content is rendered on the server
- ✅ **Fastest SSR**: No API route overhead
- ✅ **Direct Data Access**: Fewer layers between component and data
- ✅ **Caching**: Uses Next.js cache directives for performance
- ✅ **Simpler Architecture**: One less layer to maintain

### Best Practices

1. **Use Suspense Boundaries**: Wrap async data fetching in Suspense
2. **Cache Aggressively**: Use `cacheTag()` for cache invalidation
3. **Error Handling**: Handle errors at the service level
4. **Type Safety**: Use TypeScript for type-safe data access
5. **Database Optimization**: Use connection pooling and efficient queries

### Trade-offs

- ⚠️ **No API Reusability**: Can't be called from external clients
- ⚠️ **Tight Coupling**: Server components are tightly coupled to data sources
- ⚠️ **Server Load**: All requests hit the server

---

## 3. Client-Side Fetching with SWR (`/messages-swr`)

### Overview

This pattern uses **Client-Side Rendering (CSR)** where data is fetched in the browser after the initial page load. It uses SWR (stale-while-revalidate) for efficient data fetching, caching, and revalidation.

### How It Works

```
User Request → Server Component (Shell) → HTML → Client → SWR Hook → API Route → Data → Re-render
```

1. **Page Component** (`/app/[locale]/messages-swr/page.tsx`):
   - Server component that renders the shell
   - Client component handles data fetching

2. **Client Component** (`/components/messages-swr.tsx`):
   - Uses `useFetch()` hook which wraps SWR
   - Handles loading, error, and success states
   - Automatically revalidates data

3. **Custom Hook** (`/hooks/use-fetch.ts`):
   - Wraps SWR with proper error handling
   - Provides consistent API across the app

### Code Example

```tsx
// Page Component (Server)
export default function Page({ params }: PageProps<"/[locale]/messages-swr">) {
  const { locale } = use(params)
  setRequestLocale(locale)

  return (
    <>
      <h1>{t("title")}</h1>
      <MessagesComponentSWR />
    </>
  )
}

// Client Component ("use client")
export const MessagesComponentSWR = () => {
  const { data, error, isLoading } = useFetch<Message[]>(`/api/messages`)

  if (isLoading) {
    return (
      <output aria-label='Loading messages' role='status'>
        <div>Loading messages...</div>
      </output>
    )
  }

  if (error) {
    return (
      <div role='alert' aria-live='polite'>
        <h2>Error loading messages</h2>
        <p>{error.message}</p>
      </div>
    )
  }

  return (
    <ul>
      {data?.map((message) => (
        <MessageListView key={message.id} message={message} />
      ))}
    </ul>
  )
}
```

### Key Features

- ✅ **Interactive**: Data can be refreshed without page reload
- ✅ **Automatic Revalidation**: SWR automatically revalidates stale data
- ✅ **Optimistic Updates**: Can update UI before server confirms
- ✅ **Reduced Server Load**: Initial page load is lighter
- ✅ **Real-time Feel**: Can show loading states and errors immediately

### Best Practices

1. **Accessibility**: Use proper ARIA labels and roles
2. **Error Handling**: Always handle loading, error, and empty states
3. **Loading States**: Provide clear feedback during data fetching
4. **SWR Configuration**: Configure revalidation intervals appropriately
5. **Type Safety**: Use TypeScript generics for type-safe data

### Trade-offs

- ⚠️ **SEO Limitations**: Content not in initial HTML (can use SSR + hydration)
- ⚠️ **Slower Initial Content**: Users see loading state first
- ⚠️ **Client-Side Only**: Requires JavaScript to work
- ⚠️ **Network Requests**: Each user makes their own requests

---

## Comparison Table

| Feature             | SSR with API Routes | SSR without API Routes | Client-Side (SWR)     |
| ------------------- | ------------------- | ---------------------- | --------------------- |
| **Initial Load**    | Fast (pre-rendered) | Fastest (pre-rendered) | Slower (shell first)  |
| **SEO**             | ✅ Excellent        | ✅ Excellent           | ⚠️ Limited            |
| **API Reusability** | ✅ Yes              | ❌ No                  | ✅ Yes                |
| **Server Load**     | High                | High                   | Low                   |
| **Interactivity**   | Static              | Static                 | ✅ Dynamic            |
| **Caching**         | Server cache        | Server cache           | Client cache (SWR)    |
| **Error Handling**  | Server-side         | Server-side            | Client-side           |
| **Complexity**      | Medium              | Low                    | Medium                |
| **Use Case**        | Public pages, SEO   | Internal pages, speed  | Dashboards, real-time |

---

## When to Use Each Pattern

### Use SSR with API Routes (`/messages`) when:

- ✅ You need SEO-friendly pages that are publicly accessible
- ✅ You want to reuse the same API for mobile apps or external clients
- ✅ You need a clear separation between data layer and presentation
- ✅ You're building a public-facing website or blog
- ✅ You want to leverage API route middleware for authentication/authorization

**Example Use Cases:**
- Public blog posts
- Product listings
- User profiles (public)
- Documentation pages

### Use SSR without API Routes (`/messages-no-api`) when:

- ✅ You need the fastest possible SSR performance
- ✅ The data is only used by server components
- ✅ You don't need API reusability
- ✅ You want the simplest architecture
- ✅ You're building internal tools or admin panels

**Example Use Cases:**
- Admin dashboards
- Internal tools
- Private user pages
- Server-only data processing

### Use Client-Side Fetching with SWR (`/messages-swr`) when:

- ✅ You need real-time or frequently updating data
- ✅ You want interactive, dynamic user experiences
- ✅ SEO is not a primary concern
- ✅ You need optimistic updates
- ✅ You're building dashboards or authenticated user areas

**Example Use Cases:**
- User dashboards
- Real-time notifications
- Interactive data tables
- Settings pages
- Authenticated user areas

---

## Best Practices Summary

### All Patterns

1. **Error Handling**: Always implement proper error boundaries and error states
2. **Loading States**: Provide clear feedback during data fetching
3. **Type Safety**: Use TypeScript for all data fetching
4. **Accessibility**: Include proper ARIA labels and roles
5. **Performance**: Implement appropriate caching strategies

### SSR Patterns

1. **Suspense Boundaries**: Always wrap async data fetching in Suspense
2. **Cache Tags**: Use `cacheTag()` for cache invalidation
3. **Extract Loading Components**: Prevent unnecessary re-renders
4. **Error Boundaries**: Implement error.tsx for route-level errors

### Client-Side Pattern

1. **SWR Configuration**: Configure revalidation and error retry strategies
2. **Loading States**: Show loading indicators immediately
3. **Error Recovery**: Provide retry mechanisms for failed requests
4. **Optimistic Updates**: Consider optimistic UI updates for better UX

---

## Additional Resources

- [Next.js Data Fetching Documentation](https://nextjs.org/docs/app/building-your-application/data-fetching)
- [React Suspense Documentation](https://react.dev/reference/react/Suspense)
- [SWR Documentation](https://swr.vercel.app/)
- [Next.js Caching Documentation](https://nextjs.org/docs/app/building-your-application/caching)
