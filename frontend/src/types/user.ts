export const YEAR_OPTIONS = ["1st year", "2nd year", "3rd year", "4th year", "5th year or later", "Postgraduate"] as const

export type YearOfStudy = (typeof YEAR_OPTIONS)[number]

/** The Barterman user record stored in MongoDB, as returned by the API. */
export type AppUser = {
  id: string
  email: string
  name: string
  avatarUrl: string
  authProvider: string
  college: string
  course: string
  year: YearOfStudy | ""
  phone: string
  isProfileComplete: boolean
  profileCompletedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export type ProfileDetails = {
  college: string
  course: string
  year: string
  phone: string
}
