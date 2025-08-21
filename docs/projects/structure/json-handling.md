# JSON Data Handling Architecture

**Functionality:** `json-handling`

## Core Objective

To manage the fetching, processing, caching, and storage of various JSON-based data sets, such as bookmarks, GitHub activity, and OpenGraph metadata. This system provides a unified, resilient, and performant interface for handling structured JSON data from different external and internal sources.

## Architecture Diagram

See `json-handling.mmd` for a visual diagram of the data flow.

## Key Data Sources & Flow

The system handles JSON data from multiple sources, each with its own specific processing pipeline before being unified under a common caching and storage strategy.

1. **Bookmarks (from Karakeep API)**:
   - Fetches paginated bookmark data from the external Karakeep API.
   - Normalizes the raw API data into a consistent `UnifiedBookmark` format.
   - Enriches the data by invoking the `image-handling` functionality to fetch OpenGraph images for each bookmark link.
   - The final enriched JSON data is then cached and stored.

2. **GitHub Activity (from GitHub API)**:
   - Uses a hybrid strategy, fetching data from both the GraphQL and REST APIs, and even falling back to parsing a raw CSV export.
   - Aggregates and processes the data to create several JSON objects, including contribution calendars, repository statistics, and weekly activity summaries.
   - This processed JSON data is then cached and stored.

3. **OpenGraph Metadata (from any URL)**:
   - Fetches a given URL and parses the HTML to extract OpenGraph meta tags (`og:title`, `og:description`, etc.).
   - Constructs a JSON object from the extracted metadata.
   - This functionality is often triggered by other processes, like bookmark enrichment.

## Caching & Persistence

A multi-tiered caching and storage strategy is employed to ensure performance and resilience:

1. **In-Memory Cache**: A server-side `ServerCacheInstance` provides immediate, low-latency access to frequently requested JSON data.
2. **S3 Persistence**: If the in-memory cache is a miss, the system retrieves the JSON file from a persistent S3 bucket. This is the canonical data store between server restarts or deployments. All interactions with S3 are managed by the `s3-object-storage` functionality.
3. **External API Fetch**: A full fetch from the external APIs (Karakeep, GitHub) is only performed if both caches miss or during a scheduled background refresh.

This tiered approach ensures that users receive data quickly while minimizing the number of expensive calls to external services. Non-blocking background refreshes are used to keep the data up-to-date without impacting request times.
