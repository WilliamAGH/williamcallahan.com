/**
 * Upload File Page
 * @module app/upload-file/page
 * @description
 * Page for uploading documents (books) to the archive.
 * Supports PDF and ePub formats with S3 storage and Chroma vector indexing.
 */

import type { Metadata } from "next";
import { UploadWindow } from "@/components/features/upload";

export const metadata: Metadata = {
  title: "Upload Document | William Callahan",
  description: "Upload books and documents to the archive for semantic search and indexing.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UploadFilePage() {
  return (
    <div className="w-full max-w-[95%] xl:max-w-[1400px] 2xl:max-w-[1800px] mx-auto">
      <UploadWindow windowTitle="~/upload" />
    </div>
  );
}
