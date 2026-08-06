export type { CourseConfig, LanguageEntry, LessonConfig, PriceByLocale } from "./course-config-schema";
export { courseConfigSchema, parseCourseConfig, safeParseCourseConfig } from "./course-config-schema";
export { getCourseConfig } from "./white-label-data";
export type { CourseConfig as GenerateCourseConfigOutput } from "./generate-course-config";
export { generateCourseConfig } from "./generate-course-config";
export { syncCourseConfigRecords } from "./sync-course-config";