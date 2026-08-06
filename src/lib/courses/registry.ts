/** @deprecated Import bundled-course registry values from `courses.config.ts`. */
export {
  BUNDLED_COURSES,
  ACTIVE_BUNDLED_COURSES,
  ACTIVE_COURSES,
  COURSES,
  findCourseMeta,
  getActiveSlugs,
  getAllSlugs,
  getBundledSlugs,
  getCoursesByStatus,
  isBundledCourse,
  isRegisteredCourse,
  resolveCourseRegistration,
  type CourseKind,
  type CourseMeta,
  type CourseRegistration,
} from "../../../courses.config";
export type { CourseTemplateId } from "@/lib/courses/templates";
