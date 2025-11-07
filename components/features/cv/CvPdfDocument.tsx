import React from "react";
import { Document, Font, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { getCvData } from "@/lib/cv/cv-data";

const ensureFontsRegistered = (() => {
  Font.register({
    family: "IBM Plex Mono",
    fonts: [
      {
        src: "https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf",
        fontWeight: "normal",
      },
      {
        src: "https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-SemiBold.ttf",
        fontWeight: 600,
      },
    ],
  });

  return true;
})();

const styles = StyleSheet.create({
  page: {
    fontFamily: "IBM Plex Mono",
    fontSize: 10,
    lineHeight: 1.45,
    color: "#1f2937", // zinc-800
    paddingHorizontal: 36,
    paddingVertical: 40,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 20,
  },
  name: {
    fontSize: 20,
    fontWeight: 600,
    color: "#0f172a", // zinc-900
  },
  subtitle: {
    marginTop: 6,
    fontSize: 8,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#6b7280", // zinc-500
  },
  contactList: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
    marginBottom: 6,
    color: "#6b7280",
  },
  contactLink: {
    color: "#1f2937",
    textDecoration: "none",
  },
  section: {
    marginTop: 24,
  },
  firstSection: {
    marginTop: 28,
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
    flexDirection: "row",
    flexWrap: "wrap",
    fontSize: 9,
    color: "#6b7280",
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
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 4,
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

const CvPdfDocument = (): React.ReactElement => {
  if (!ensureFontsRegistered) {
    throw new Error("Failed to register fonts for CV PDF rendering");
  }

  // Keep PDF output aligned with the visible /cv page.
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
            <View style={styles.contactItem}>
              <Text>San Francisco, California</Text>
            </View>
            <View style={styles.contactItem}>
              <Link src={siteUrl} style={styles.contactLink}>
                {personalSiteHost}
              </Link>
            </View>
            <View style={styles.contactItem}>
              <Link src={aventureUrl} style={styles.contactLink}>
                {aventureHost}
              </Link>
            </View>
            <View style={styles.contactItem}>
              <Link src={twitterUrl} style={styles.contactLink}>
                {twitterHandle}
              </Link>
            </View>
            <View style={styles.contactItem}>
              <Link src={linkedInUrl} style={styles.contactLink}>
                {linkedInLabel}
              </Link>
            </View>
          </View>
        </View>

        <View style={[styles.section, styles.firstSection]}>
          <Text style={styles.sectionTitle}>Professional Summary</Text>
          <Text style={styles.paragraph}>{professionalSummary}</Text>
        </View>

        {showQualifications && qualifications.length > 0 ? (
          <View style={styles.section}>
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
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Experience</Text>
            {experiences.map(experienceItem => (
              <View key={experienceItem.id} style={styles.experienceItem}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.experienceCompany}>{experienceItem.company}</Text>
                  <Text style={styles.experiencePeriod}>{experienceItem.period}</Text>
                </View>
                <View style={styles.experienceMeta}>
                  <Text>{experienceItem.headline}</Text>
                  {experienceItem.location ? <Text>· {experienceItem.location}</Text> : null}
                  {experienceItem.displayWebsite && experienceItem.website ? (
                    <Link src={experienceItem.website} style={styles.contactLink}>
                      · {experienceItem.displayWebsite}
                    </Link>
                  ) : null}
                </View>
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
          <View style={styles.section}>
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
                        <Text>{tag.toUpperCase()}</Text>
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
          <View style={styles.section}>
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
              <View style={styles.section}>
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
          <View style={styles.section}>
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
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Technical Focus</Text>
            {technicalFocus.map(section => (
              <View key={section.id} style={styles.focusCard}>
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
