export const departments: Record<string, string[]> = {
  "College of Computer Studies": [
    "BS Computer Science",
    "BS Information Technology",
    "BS Information Systems",
  ],
  "College of Engineering": [
    "BS Civil Engineering",
    "BS Electrical Engineering",
    "BS Mechanical Engineering",
  ],
  "College of Business": [
    "BS Accountancy",
    "BS Business Administration",
    "BS Marketing",
  ],
  "College of Arts & Sciences": ["BA Psychology", "BS Biology", "BA English"],
}

// The database stores department IDs, not display labels. Keep this mapping in
// sync with the demo departments seeded by database.sql.
export const departmentIds: Record<string, string> = {
  "College of Computer Studies": "ccs",
  "College of Engineering": "coe",
  "College of Business": "cba",
  "College of Arts & Sciences": "cas",
}

export const institutionalEmailPattern =
  /@([a-z0-9-]+\.)+(edu|ac|sch|school|college|university)(\.[a-z]{2,})?$/i

export const passwordPolicyMessage =
  "Use at least 8 characters with an uppercase letter, lowercase letter, number, and special character."

export const isStrongPassword = (password: string) =>
  password.length >= 8 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /[0-9]/.test(password) &&
  /[\W_]/.test(password)
