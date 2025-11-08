import React from "react";
import { Circle, Document, Font, Link, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { getCvData } from "@/lib/cv/cv-data";
import path from "path";

const ensureFontsRegistered = (() => {
  // For server-side rendering, use local font files
  const isServer = typeof window === "undefined";

  if (isServer) {
    // Server-side: Use file system paths
    const fontsDir = path.join(process.cwd(), "public", "fonts", "ibm-plex-mono");

    Font.register({
      family: "IBM Plex Mono",
      fonts: [
        {
          src: path.join(fontsDir, "IBMPlexMono-Regular.ttf"),
          fontWeight: "normal",
          fontStyle: "normal",
        },
        {
          src: path.join(fontsDir, "IBMPlexMono-Italic.ttf"),
          fontWeight: "normal",
          fontStyle: "italic",
        },
        {
          src: path.join(fontsDir, "IBMPlexMono-SemiBold.ttf"),
          fontWeight: 600,
          fontStyle: "normal",
        },
      ],
    });
  } else {
    // Client-side fallback (if ever used in browser context)
    Font.register({
      family: "IBM Plex Mono",
      fonts: [
        {
          src: "/fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf",
          fontWeight: "normal",
          fontStyle: "normal",
        },
        {
          src: "/fonts/ibm-plex-mono/IBMPlexMono-Italic.ttf",
          fontWeight: "normal",
          fontStyle: "italic",
        },
        {
          src: "/fonts/ibm-plex-mono/IBMPlexMono-SemiBold.ttf",
          fontWeight: 600,
          fontStyle: "normal",
        },
      ],
    });
  }

  return true;
})();

const styles = StyleSheet.create({
  page: {
    fontFamily: "IBM Plex Mono",
    fontSize: 10,
    lineHeight: 1.45,
    color: "#1f2937", // zinc-800
    paddingHorizontal: 36,
    paddingVertical: 8,
    paddingTop: 28,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 8,
  },
  name: {
    fontSize: 20,
    fontWeight: 600,
    color: "#0f172a", // zinc-900
  },
  subtitle: {
    marginTop: 8,
    fontSize: 8,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#6b7280", // zinc-500
  },
  contactList: {
    marginTop: 2,
    flexDirection: "column",
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 2,
  },
  contactRowLast: {
    marginBottom: 0,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
    marginBottom: 2,
    color: "#6b7280",
  },
  contactIcon: {
    width: 10,
    height: 10,
    marginRight: 4,
  },
  contactLink: {
    color: "#1f2937",
    textDecoration: "none",
  },
  /**
   * Base wrapper for major CV sections. Apply spacing with sectionSpacing or firstSection.
   */
  section: {},
  /**
   * Default spacing applied to all sections except the first.
   */
  sectionSpacing: {
    marginTop: 24,
  },
  /**
   * Tighten the spacing directly below the header without impacting later sections.
   */
  firstSection: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#6b7280",
  },
  paragraph: {
    marginTop: 8,
    color: "#1f2937",
  },
  cardGrid: {
    marginTop: 12,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  qualificationCard: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 4,
    padding: 10,
    width: "48%",
    backgroundColor: "#fafafa",
    marginBottom: 10,
  },
  qualificationTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: "#0f172a",
  },
  qualificationMeta: {
    marginTop: 6,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#6b7280",
  },
  experienceItem: {
    marginTop: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e4e4e7",
    paddingBottom: 12,
  },
  experienceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  experienceCompany: {
    fontSize: 11,
    fontWeight: 600,
    color: "#0f172a",
  },
  experiencePeriod: {
    fontSize: 9,
    color: "#6b7280",
  },
  experienceMeta: {
    marginTop: 4,
  },
  experienceMetaHeadline: {
    fontSize: 9,
    color: "#6b7280",
  },
  experienceMetaSecondary: {
    marginTop: 2,
    flexDirection: "row",
    flexWrap: "wrap",
    fontSize: 9,
    color: "#6b7280",
  },
  experienceMetaSecondarySegment: {
    flexDirection: "row",
    alignItems: "baseline",
    marginRight: 8,
  },
  experienceMetaSecondarySeparator: {
    marginRight: 6,
    color: "#9ca3af",
  },
  experienceMetaSecondaryText: {
    fontSize: 9,
    color: "#6b7280",
  },
  experienceMetaSecondaryLink: {
    fontSize: 9,
    color: "#1f2937",
    textDecoration: "none",
  },
  bulletList: {
    marginTop: 6,
    paddingLeft: 12,
    color: "#334155",
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 2,
  },
  bulletMarker: {
    marginRight: 4,
  },
  projectCard: {
    marginTop: 12,
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: "#d4d4d8",
  },
  projectHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  projectName: {
    fontSize: 11,
    fontWeight: 600,
    color: "#0f172a",
  },
  tagList: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    fontSize: 7,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#6b7280",
  },
  tagBadge: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingTop: 1,
    paddingBottom: 1,
    marginRight: 4,
    marginBottom: 4,
  },
  tagBadgeText: {
    fontSize: 7,
  },
  educationItem: {
    marginTop: 10,
  },
  educationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 10,
    fontWeight: 600,
    color: "#0f172a",
  },
  educationDegree: {
    marginTop: 2,
    fontSize: 9,
    color: "#334155",
  },
  educationLocation: {
    marginTop: 2,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#6b7280",
  },
  courseGroup: {
    marginTop: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d4d4d8",
    borderRadius: 4,
    padding: 10,
  },
  courseHeader: {
    fontSize: 10,
    fontWeight: 600,
    color: "#0f172a",
  },
  courseRow: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#334155",
  },
  certificationItem: {
    marginTop: 8,
  },
  certificationName: {
    fontSize: 10,
    fontWeight: 600,
    color: "#0f172a",
  },
  certificationMeta: {
    marginTop: 2,
    flexDirection: "row",
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#6b7280",
  },
  focusCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 4,
    padding: 10,
  },
  focusTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: "#0f172a",
  },
  footer: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d8",
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#6b7280",
  },
});

const CONTACT_ICON_STROKE = "#6b7280";

// Recreate contact icons with PDF-safe vector primitives to mirror the on-page iconography.
// Use fillOpacity="0" to ensure PDF renderers don't fill the paths with black
// This is more reliable than fill="none" or fill="transparent" across different PDF viewers
const ContactIconFrame = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <Svg
    viewBox="0 0 24 24"
    style={styles.contactIcon}
    stroke={CONTACT_ICON_STROKE}
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    fill="rgba(0, 0, 0, 0)"
    fillOpacity="0"
  >
    {children}
  </Svg>
);

const MapPinPdfIcon = (): React.ReactElement => (
  <ContactIconFrame>
    <Path
      d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
      fillOpacity="0"
    />
    <Circle cx="12" cy="10" r="3" fillOpacity="0" />
  </ContactIconFrame>
);

const GlobePdfIcon = (): React.ReactElement => (
  <ContactIconFrame>
    <Circle cx="12" cy="12" r="10" fillOpacity="0" />
    <Path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" fillOpacity="0" />
    <Path d="M2 12h20" fillOpacity="0" />
  </ContactIconFrame>
);

const LinkedinPdfIcon = (): React.ReactElement => (
  <ContactIconFrame>
    <Path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" fillOpacity="0" />
    <Rect width="4" height="12" x="2" y="9" fillOpacity="0" />
    <Circle cx="4" cy="4" r="2" fillOpacity="0" />
  </ContactIconFrame>
);

const XPdfIcon = (): React.ReactElement => (
  <ContactIconFrame>
    <Path d="M5 4l11.733 16h3.267l-11.733 -16z" fillOpacity="0" />
    <Path d="M5 20l6.768 -6.768m2.46 -2.46l5.772 -6.772" fillOpacity="0" />
  </ContactIconFrame>
);

const CvPdfDocument = (): React.ReactElement => {
  if (!ensureFontsRegistered) {
    throw new Error("Failed to register fonts for CV PDF rendering");
  }

  // Keep PDF output aligned with the visible /cv page.
  // The contact header mirrors the page layout by splitting location/website metadata
  // into a dedicated first row so those items always start on a new line.
  // Qualifications are intentionally hidden in the page UI during iteration;
  // mirror that behavior in the PDF until the section is finalized.
  const showQualifications: boolean = false;

  const {
    professionalSummary,
    qualifications,
    technicalFocus,
    experiences,
    projects,
    degrees,
    certifications,
    groupedCourses,
    siteUrl,
    personalSiteHost,
    aventureUrl,
    aventureHost,
    twitterUrl,
    twitterHandle,
    linkedInUrl,
    linkedInLabel,
    lastUpdatedDisplay,
  } = getCvData();

  return (
    <Document
      title="William Callahan — Curriculum Vitae"
      author="William Callahan"
      subject="Curriculum Vitae"
      creator="williamcallahan.com"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>William Callahan</Text>
          <Text style={styles.subtitle}>CFA Charterholder · CFP® Professional</Text>
          <View style={styles.contactList}>
            <View style={styles.contactRow}>
              <View style={styles.contactItem}>
                <MapPinPdfIcon />
                <Text>San Francisco, California</Text>
              </View>
              <View style={styles.contactItem}>
                <GlobePdfIcon />
                <Link src={siteUrl} style={styles.contactLink}>
                  {personalSiteHost}
                </Link>
              </View>
              <View style={styles.contactItem}>
                <GlobePdfIcon />
                <Link src={aventureUrl} style={styles.contactLink}>
                  {aventureHost}
                </Link>
              </View>
            </View>
            <View style={[styles.contactRow, styles.contactRowLast]}>
              <View style={styles.contactItem}>
                <XPdfIcon />
                <Link src={twitterUrl} style={styles.contactLink}>
                  {twitterHandle}
                </Link>
              </View>
              <View style={styles.contactItem}>
                <LinkedinPdfIcon />
                <Link src={linkedInUrl} style={styles.contactLink}>
                  {linkedInLabel}
                </Link>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.section, styles.firstSection]}>
          <Text style={styles.sectionTitle}>Professional Summary</Text>
          <Text style={styles.paragraph}>{professionalSummary}</Text>
        </View>

        {showQualifications && qualifications.length > 0 ? (
          <View style={[styles.section, styles.sectionSpacing]}>
            <Text style={styles.sectionTitle}>Distinguished Qualifications</Text>
            <View style={styles.cardGrid}>
              {qualifications.map(item => (
                <View key={item.id} style={styles.qualificationCard}>
                  <Text style={styles.qualificationTitle}>{item.title}</Text>
                  {item.meta.map(line => (
                    <Text key={line} style={styles.qualificationMeta}>
                      {line.toUpperCase()}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {experiences.length > 0 ? (
          <View style={[styles.section, styles.sectionSpacing]}>
            <Text style={styles.sectionTitle}>Professional Experience</Text>
            {experiences.map(experienceItem => (
              <View key={experienceItem.id} style={styles.experienceItem}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.experienceCompany}>{experienceItem.company}</Text>
                  <Text style={styles.experiencePeriod}>{experienceItem.period}</Text>
                </View>
                {(() => {
                  const secondarySegments: Array<{
                    key: string;
                    content: string;
                    href: string;
                  }> = [];

                  if (experienceItem.displayWebsite && experienceItem.website) {
                    secondarySegments.push({
                      key: "website",
                      content: experienceItem.displayWebsite,
                      href: experienceItem.website,
                    });
                  }

                  return (
                    <View style={styles.experienceMeta}>
                      <Text style={styles.experienceMetaHeadline}>{experienceItem.headline}</Text>
                      {experienceItem.location || secondarySegments.length > 0 ? (
                        <View style={styles.experienceMetaSecondary}>
                          {experienceItem.location ? (
                            <View style={styles.experienceMetaSecondarySegment}>
                              <Text style={styles.experienceMetaSecondarySeparator}>·</Text>
                              <Text style={styles.experienceMetaSecondaryText}>{experienceItem.location}</Text>
                            </View>
                          ) : null}
                          {secondarySegments.map(segment => (
                            <View key={segment.key} style={styles.experienceMetaSecondarySegment}>
                              <Text style={styles.experienceMetaSecondarySeparator}>·</Text>
                              <Link src={segment.href} style={[styles.contactLink, styles.experienceMetaSecondaryLink]}>
                                {segment.content}
                              </Link>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })()}
                {experienceItem.bullets.length > 0 ? (
                  <View style={styles.bulletList}>
                    {experienceItem.bullets.map(bullet => (
                      <View key={`${experienceItem.id}-${bullet}`} style={styles.bulletItem}>
                        <Text style={styles.bulletMarker}>•</Text>
                        <Text>{bullet}</Text>
                      </View>
                    ))}
                  </View>
                ) : experienceItem.summary ? (
                  <Text style={styles.paragraph}>{experienceItem.summary}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {projects.length > 0 ? (
          <View style={[styles.section, styles.sectionSpacing]}>
            {/* Force projects onto a fresh page so printed copies preserve a clear section boundary. */}
            <Text style={styles.sectionTitle}>Highlighted Technical Projects</Text>
            {projects.map(project => (
              <View key={project.id} style={styles.projectCard}>
                <View style={styles.projectHeader}>
                  <Text style={styles.projectName}>{project.name}</Text>
                  {project.url ? (
                    <Link src={project.url} style={styles.contactLink}>
                      View
                    </Link>
                  ) : null}
                </View>
                {project.tags.length > 0 ? (
                  <View style={styles.tagList}>
                    {project.tags.map(tag => (
                      <View key={`${project.id}-${tag}`} style={styles.tagBadge}>
                        <Text style={styles.tagBadgeText}>{tag.toUpperCase()}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.paragraph}>{project.description}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {degrees.length > 0 ? (
          <View style={[styles.section, styles.sectionSpacing]}>
            {/* Education should start on a new page to mirror the CV layout strategy discussed with stakeholders. */}
            <Text style={styles.sectionTitle}>Education</Text>
            {degrees.map(degree => (
              <View key={degree.id} style={styles.educationItem}>
                <View style={styles.educationHeader}>
                  <Text>{degree.institution}</Text>
                  <Text>{degree.year}</Text>
                </View>
                <Text style={styles.educationDegree}>{degree.degree}</Text>
                <Text style={styles.educationLocation}>{degree.location.toUpperCase()}</Text>
              </View>
            ))}

            {groupedCourses.length > 0 ? (
              <View style={[styles.section, styles.sectionSpacing]}>
                <Text style={styles.sectionTitle}>Continuing Education (Selected)</Text>
                {groupedCourses.map(group => (
                  <View key={group.institution} style={styles.courseGroup}>
                    <Text style={styles.courseHeader}>{group.institution}</Text>
                    {group.courses.map(course => (
                      <View key={course.id} style={styles.courseRow}>
                        <Text>{course.name}</Text>
                        <Text>{course.year}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {certifications.length > 0 ? (
          <View style={[styles.section, styles.sectionSpacing]}>
            <Text style={styles.sectionTitle}>Certifications & Professional Development</Text>
            {certifications.map(certificationItem => (
              <View key={certificationItem.id} style={styles.certificationItem}>
                <Text style={styles.certificationName}>{certificationItem.name}</Text>
                <View style={styles.certificationMeta}>
                  <Text>{certificationItem.institution}</Text>
                  <Text>• {certificationItem.year}</Text>
                  <Text>• {certificationItem.location}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {technicalFocus.length > 0 ? (
          <View style={[styles.section, styles.sectionSpacing]}>
            <Text style={styles.sectionTitle}>Technical Focus</Text>
            {technicalFocus.map(section => (
              <View key={section.id} style={styles.focusCard} wrap={false}>
                <Text style={styles.focusTitle}>{section.title}</Text>
                <View style={styles.bulletList}>
                  {section.bullets.map(item => (
                    <View key={`${section.id}-${item}`} style={styles.bulletItem}>
                      <Text style={styles.bulletMarker}>•</Text>
                      <Text>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text>Last updated: {lastUpdatedDisplay}</Text>
        </View>
      </Page>
    </Document>
  );
};

export default CvPdfDocument;
