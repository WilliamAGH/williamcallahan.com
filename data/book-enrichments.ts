/**
 * Book Registry & Enrichment Data
 * @module data/book-enrichments
 * @description
 * Complete book registry keyed by AudioBookShelf item ID.
 * Each entry includes the site slug (for reference) and optional enrichment
 * fields (findMyBookUrl, amazonUrl, etc.) merged during generation.
 *
 * To add enrichment for a book, set the optional URL/text fields.
 * Run `bun scripts/generate-books.ts` to regenerate the S3 dataset.
 */

import type { BookRegistryEntry } from "@/types/schemas/book";

export const bookEnrichments: Record<string, BookRegistryEntry> = {
  // ── A ──────────────────────────────────────────────────────────────────────
  "b8896a01-ab31-4880-8cb8-3ab7ddd582ce": {
    slug: "100-java-mistakes-and-how-to-avoid-them-tagir-valeev-b8896a01-ab31-4880-8cb8-3ab7ddd582ce",
  },
  "a445d5a8-8577-45ad-b73e-ae77aeb5cd4d": {
    slug: "a-simple-guide-to-retrieval-augmented-generation-abhinav-kimothi-a445d5a8-8577-45ad-b73e-ae77aeb5cd4d",
  },
  "21b05f78-a5c8-456f-a3ad-f3b59d373326": {
    slug: "advanced-algorithms-and-data-structures-marcello-la-rocca-21b05f78-a5c8-456f-a3ad-f3b59d373326",
  },
  "fbf3ad42-f529-48b2-9a87-9493e9ee3a32": {
    slug: "ai-agents-in-action-micheal-lanham-fbf3ad42-f529-48b2-9a87-9493e9ee3a32",
  },
  "2a130e9b-fc05-4225-9105-6e987838cda1": {
    slug: "ai-as-a-service-peter-elger-eoin-shanaghy-2a130e9b-fc05-4225-9105-6e987838cda1",
  },
  "b2caee06-5b71-4a8c-85d2-387325fe7b99": {
    slug: "ai-powered-developer-nathan-crocker-b2caee06-5b71-4a8c-85d2-387325fe7b99",
  },
  "b2252f2a-3454-49c3-aaa6-c8e09cc09692": {
    slug: "ai-powered-search-trey-grainger-doug-turnbull-b2252f2a-3454-49c3-aaa6-c8e09cc09692",
  },
  // ── B ──────────────────────────────────────────────────────────────────────
  "d5db201c-2158-43da-bed5-b1e71fc0891c": {
    slug: "build-a-frontend-web-framework-from-scratch-angel-sola-orbaiceta-d5db201c-2158-43da-bed5-b1e71fc0891c",
  },
  "48eaa0e3-66a7-4343-92ea-74c2dab1c333": {
    slug: "build-a-reasoning-model-from-scratch-sebastian-raschka-48eaa0e3-66a7-4343-92ea-74c2dab1c333",
  },
  "3110ab16-9c12-41ec-a3d8-214ed7467f91": {
    slug: "build-ai-applications-with-spring-ai-fu-cheng-3110ab16-9c12-41ec-a3d8-214ed7467f91",
  },
  "d1334830-c273-4d35-bb69-d90bcc063976": {
    slug: "build-financial-software-with-generative-ai-from-christopher-kardell-mark-brouwer-d1334830-c273-4d35-bb69-d90bcc063976",
  },
  // ── C ──────────────────────────────────────────────────────────────────────
  "92e78d2a-5284-4699-aa5b-2aae744978f0": {
    slug: "causal-ai-robert-osazuwa-ness-92e78d2a-5284-4699-aa5b-2aae744978f0",
  },
  // ── D ──────────────────────────────────────────────────────────────────────
  "bd8208dc-594d-471b-932a-b87b939650aa": {
    slug: "deep-learning-for-search-tommaso-teofili-bd8208dc-594d-471b-932a-b87b939650aa",
  },
  // ── E ──────────────────────────────────────────────────────────────────────
  "8fdb97ab-e76f-4124-831a-1c8ad892bd62": {
    slug: "effective-conversational-ai-andrew-freed-cari-jacobs-8fdb97ab-e76f-4124-831a-1c8ad892bd62",
  },
  "f9d32b71-4986-4cf1-905a-57a991e03dfa": {
    slug: "essential-graphrag-toma-bratanic-oscar-hane-f9d32b71-4986-4cf1-905a-57a991e03dfa",
  },
  "deab3c17-d9db-4c93-9f8b-936cd1885405": {
    slug: "essential-typescript-5-third-edition-adam-freeman-deab3c17-d9db-4c93-9f8b-936cd1885405",
  },
  // ── G ──────────────────────────────────────────────────────────────────────
  "1d951c01-ad8e-48db-8243-4ac39b9cbaa0": {
    slug: "generative-ai-in-action-amit-bahree-1d951c01-ad8e-48db-8243-4ac39b9cbaa0",
  },
  "b93cd7e4-c4ab-4773-b1b2-2074049f225b": {
    slug: "getting-started-with-natural-language-processing-ekaterina-kochmar-b93cd7e4-c4ab-4773-b1b2-2074049f225b",
  },
  "8a0a9857-ece5-4d34-8e42-8a4df5aca645": {
    slug: "grokking-artificial-intelligence-algorithms-rishal-hurbans-8a0a9857-ece5-4d34-8e42-8a4df5aca645",
  },
  // ── H ──────────────────────────────────────────────────────────────────────
  "ea1ab068-ef92-45df-a49a-331116fa6f86": {
    slug: "how-large-language-models-work-edward-raff-drew-farris-ea1ab068-ef92-45df-a49a-331116fa6f86",
  },
  // ── I ──────────────────────────────────────────────────────────────────────
  "0c5f04c4-0088-4d94-ad70-094222577b23": {
    slug: "inside-ai-akli-adjaoute-0c5f04c4-0088-4d94-ad70-094222577b23",
  },
  "5ef90219-882a-406f-9518-eb3098a5341e": {
    slug: "interpretable-ai-ajay-thampi-5ef90219-882a-406f-9518-eb3098a5341e",
  },
  // ── J ──────────────────────────────────────────────────────────────────────
  "b298f35a-1bd1-4ddd-8085-d134cc4c2751": {
    slug: "just-use-postgres-denis-magda-b298f35a-1bd1-4ddd-8085-d134cc4c2751",
  },
  // ── K ──────────────────────────────────────────────────────────────────────
  "86674ef7-bf4c-41af-9093-0fe9586ca942": {
    slug: "knowledge-graphs-and-llms-in-action-alessandro-negro-vlastimil-kus-86674ef7-bf4c-41af-9093-0fe9586ca942",
  },
  // ── L ──────────────────────────────────────────────────────────────────────
  "18d08b93-a9a5-4d75-9435-1f8dd7fc87dc": {
    slug: "learn-ai-assisted-python-programming-second-leo-porter-daniel-zingaro-18d08b93-a9a5-4d75-9435-1f8dd7fc87dc",
  },
  "87228541-4776-4715-a95f-785632c20f44": {
    slug: "learn-go-with-pocket-sized-projects-alinor-latour-donia-chaiehloudj-87228541-4776-4715-a95f-785632c20f44",
  },
  // ── O ──────────────────────────────────────────────────────────────────────
  "b46b73c0-1bc2-4f4b-b030-5592b3238c00": {
    slug: "object-design-style-guide-matthias-noback-b46b73c0-1bc2-4f4b-b030-5592b3238c00",
  },
  // ── P ──────────────────────────────────────────────────────────────────────
  "7ecb5faf-12ec-49ad-88cf-6831df2bb361": {
    slug: "practical-artificial-intelligence-programming-with-mark-watson-7ecb5faf-12ec-49ad-88cf-6831df2bb361",
  },
  // ── Q ──────────────────────────────────────────────────────────────────────
  "8868b37a-dbd5-44d3-9ca2-7282ad6ec3d7": {
    slug: "quarkus-in-action-martin-tefanko-jan-martika-8868b37a-dbd5-44d3-9ca2-7282ad6ec3d7",
  },
  // ── R ──────────────────────────────────────────────────────────────────────
  "7510606a-63eb-4b07-8fd3-5506d6c26a7d": {
    slug: "react-in-depth-morten-barklund-7510606a-63eb-4b07-8fd3-5506d6c26a7d",
  },
  "73da20e3-9fa1-421b-9e5e-b0ea885f29b7": {
    slug: "react-quickly-second-edition-azat-mardan-morten-barklund-73da20e3-9fa1-421b-9e5e-b0ea885f29b7",
  },
  // ── S ──────────────────────────────────────────────────────────────────────
  "740583b6-3206-4054-95a3-488141227469": {
    slug: "secrets-of-the-javascript-ninja-2nd-edition-josip-maras-john-resig-740583b6-3206-4054-95a3-488141227469",
  },
  "822d14aa-076b-47e1-bb43-fb5191878a10": {
    slug: "software-testing-with-generative-ai-mark-winteringham-822d14aa-076b-47e1-bb43-fb5191878a10",
  },
  "e6ec2f9f-e700-405a-bf27-4e19b78a645f": {
    slug: "spring-ai-in-action-craig-walls-e6ec2f9f-e700-405a-bf27-4e19b78a645f",
  },
  "ffaa0b2c-ef0b-44dc-8efa-abb170695c8c": {
    slug: "spring-boot-in-practice-somnath-musib-ffaa0b2c-ef0b-44dc-8efa-abb170695c8c",
  },
  "137f72eb-558d-4025-bf9b-84c3ae744055": {
    slug: "succeeding-with-ai-veljko-krunic-137f72eb-558d-4025-bf9b-84c3ae744055",
  },
  // ── T ──────────────────────────────────────────────────────────────────────
  "b3a4f6d6-3174-4abe-b1bb-a33dc340469b": {
    slug: "the-ai-pocketbook-emmanuel-maggiori-b3a4f6d6-3174-4abe-b1bb-a33dc340469b",
  },
  "effb08a0-b2db-43e8-a48e-70d7ace78e70": {
    slug: "the-art-of-ai-product-development-janna-lipenkova-effb08a0-b2db-43e8-a48e-70d7ace78e70",
  },
  "79834a3c-8bd5-4509-8e9f-4941aa2f8417": {
    slug: "the-complete-obsolete-guide-to-generative-ai-david-clinton-79834a3c-8bd5-4509-8e9f-4941aa2f8417",
  },
  "91e3475d-1bb2-40ab-b820-951a84e2fa2b": {
    slug: "the-joy-of-javascript-luis-atencio-91e3475d-1bb2-40ab-b820-951a84e2fa2b",
  },
  "c84f579f-1be6-4f9c-8048-3a18962b8065": {
    slug: "the-rlhf-book-nathan-lambert-c84f579f-1be6-4f9c-8048-3a18962b8065",
  },
  "ac301e16-40b5-4e64-8820-a7cf7d91bab1": {
    slug: "troubleshooting-java-second-edition-laurentiu-spilca-ac301e16-40b5-4e64-8820-a7cf7d91bab1",
  },
  "cd8f9b4a-0555-405b-a95f-8fb8ab3110ea": {
    slug: "typescript-quickly-yakov-fain-anton-moiseev-cd8f9b4a-0555-405b-a95f-8fb8ab3110ea",
  },
  // ── Z ──────────────────────────────────────────────────────────────────────
  "5b8f3c6c-3eb1-488c-bfb7-9671f574ac21": {
    slug: "zero-to-ai-nicol-valigi-gianluca-mauro-5b8f3c6c-3eb1-488c-bfb7-9671f574ac21",
  },
};
