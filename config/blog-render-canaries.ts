export const BLOG_RENDER_CANARIES = [
  {
    slug: "vercel-blob-vs-hetzner-digitalocean-aws-s3-object-storage-comparison",
    title: "Vercel Blob vs Hetzner vs DigitalOcean vs AWS S3: Object Storage Showdown",
    markers: [
      {
        section: "opening",
        text: "Vercel just announced that Vercel Blob is now generally available on all plans. It's already powering production apps like v0.dev and storing over 400 million files. A good time to compare it with other popular object storage options like Hetzner Object Storage, DigitalOcean Spaces, and AWS S3.",
      },
      {
        section: "middle",
        text: "All these services integrate easily with modern languages. Here are some examples:",
      },
      {
        section: "ending",
        text: "You can start with one service and migrate to another as your needs change, often with minimal code changes.",
      },
    ],
    interactions: [],
  },
  {
    slug: "project-level-java-maven-gradle-versioning",
    title: "Java, Maven, & Gradle: OS Setup & Project-Level Usage",
    markers: [
      {
        section: "opening",
        text: "For project setups, you'll need a Java Development Kit (JDK) installed on your system. Optionally, you might install Maven and/or Gradle globally, though for most project work, their respective project-level wrappers (mvnw, gradlew) are also used.",
      },
      { section: "middle", text: "Part 3: Maven - Project Versioning & Common Commands" },
      { section: "ending", text: "Part 5: Managing & Updating Dependencies" },
    ],
    interactions: [
      {
        summary: "Core Maven Lifecycle & Commands (using ./mvnw)",
        revealedContent: "./mvnw clean package",
      },
      {
        summary: "Dependency Declaration & Update Commands",
        revealedContent:
          "IntelliJ IDEA and VS Code (with Java extensions) often provide UI features to detect and update dependencies.",
      },
    ],
  },
] as const;
