/**
 * Shared by runtime reads and the dry-run-first alias repair command.
 * Walk only the alias graph, stopping at a terminal or a repeated vertex.
 * A corrupt cycle keeps the established primary identity, then the most-used
 * member, then the oldest identity (slug breaks exact ties). No tag is dropped.
 */
export const BOOKMARK_TAG_ALIAS_CTE = `
WITH RECURSIVE alias_edges AS (
  SELECT source_tag_slug, target_tag_slug
  FROM bookmarks_tags_links
  WHERE link_type = 'alias'
), alias_walk AS (
  SELECT source_tag_slug, source_tag_slug AS tag_slug,
         ARRAY[source_tag_slug]::text[] AS path
  FROM alias_edges
  UNION ALL
  SELECT walk.source_tag_slug, edge.target_tag_slug, walk.path || edge.target_tag_slug
  FROM alias_walk AS walk
  JOIN alias_edges AS edge ON edge.source_tag_slug = walk.tag_slug
  WHERE NOT edge.target_tag_slug = ANY(walk.path)
), alias_endpoints AS (
  SELECT walk.source_tag_slug, walk.tag_slug,
         CASE WHEN edge.target_tag_slug = ANY(walk.path)
           THEN walk.path[array_position(walk.path, edge.target_tag_slug):cardinality(walk.path)]
           ELSE ARRAY[]::text[] END AS cycle_slugs
  FROM alias_walk AS walk
  LEFT JOIN alias_edges AS edge ON edge.source_tag_slug = walk.tag_slug
  WHERE edge.source_tag_slug IS NULL OR edge.target_tag_slug = ANY(walk.path)
), cycle_members AS (
  SELECT DISTINCT unnest(cycle_slugs) AS tag_slug FROM alias_endpoints
), cycle_usage AS (
  SELECT member.tag_slug, count(link.bookmark_id) AS member_count
  FROM cycle_members AS member
  LEFT JOIN bookmark_tag_links AS link ON link.tag_slug = member.tag_slug
  GROUP BY member.tag_slug
), canonical_tag_aliases AS (
  SELECT endpoint.source_tag_slug,
         CASE WHEN cardinality(endpoint.cycle_slugs) = 0 THEN endpoint.tag_slug
           ELSE (
             SELECT tag.tag_slug
             FROM bookmarks_tags AS tag
             JOIN cycle_usage AS usage ON usage.tag_slug = tag.tag_slug
             WHERE tag.tag_slug = ANY(endpoint.cycle_slugs)
             ORDER BY (tag.tag_status = 'primary') DESC, usage.member_count DESC,
                      tag.created_at ASC, tag.tag_slug COLLATE "C" ASC
             LIMIT 1
           ) END AS target_tag_slug,
         endpoint.cycle_slugs
  FROM alias_endpoints AS endpoint
)
`;
