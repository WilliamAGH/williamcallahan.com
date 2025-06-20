#!/usr/bin/env bun

/**
 * Data Updater CLI
 *
 * Thin CLI wrapper for DataFetchManager operations.
 * Handles all data update operations including S3 updates and prefetching.
 */

import { DataFetchManagerCLI } from "@/lib/server/data-fetch-manager";

// Run the CLI
void DataFetchManagerCLI.run();
