// The database stores admission_year; the semester is worked out here.
// ASSUMPTION: odd semesters (1,3,5,7) start in July, even ones (2,4,6,8) in January.
// Colleges differ, so check your academic calendar and change ODD_SEMESTER_START_MONTH in .env.
const config = require('../config');

function currentSemester(admissionYear, now = new Date()) {
  if (!admissionYear) return null;
  const month = now.getMonth() + 1; // 1-12
  const start = config.oddSemesterStartMonth;
  const inOddTerm = month >= start; // e.g. Jul-Dec
  const academicYearStart = inOddTerm ? now.getFullYear() : now.getFullYear() - 1;
  const yearsIn = academicYearStart - admissionYear;
  const semester = yearsIn * 2 + (inOddTerm ? 1 : 2);
  return semester >= 1 && semester <= 8 ? semester : null; // outside a 4-year course: unknown
}

module.exports = { currentSemester };
