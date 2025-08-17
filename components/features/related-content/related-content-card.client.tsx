import type { RelatedContentItem } from "@/types/related-content";
import Link from "next/link";

export function RelatedContentCard({ item }: { item: RelatedContentItem }) {
  return (
    <Link href={item.url} className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
      <h3 className="font-bold">{item.title}</h3>
      <p className="text-sm text-gray-600">{item.description}</p>
      <div className="text-xs text-gray-400 mt-2">
        <span>{item.type}</span> - <span>Score: {item.score.toFixed(2)}</span>
      </div>
    </Link>
  );
}
