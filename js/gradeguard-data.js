/* =========================================================
   GradeGuard - shared data and calculation layer (Phase 3)
   ---------------------------------------------------------
   This file is the "model" of the application. It owns:
     1. The sample (seed) course data.
     2. Saving and loading courses with localStorage.
     3. All grade and GPA math, written as pure functions so
        the page script (js/script.js) can reuse them anywhere.
   It contains no DOM code, so it can be tested on its own.
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "gradeguard.courses.v1";

  /* Percentage-to-GPA conversion chart. Must match the chart
     shown on gpa-overview.html (top bracket first). */
  const GPA_SCALE = [
    { min: 90, letter: "A+", points: 4.0, range: "90% - 100%" },
    { min: 80, letter: "A", points: 3.8, range: "80% - 89%" },
    { min: 75, letter: "B+", points: 3.3, range: "75% - 79%" },
    { min: 70, letter: "B", points: 3.0, range: "70% - 74%" },
    { min: 65, letter: "C+", points: 2.3, range: "65% - 69%" },
    { min: 60, letter: "C", points: 2.0, range: "60% - 64%" },
    { min: 55, letter: "D+", points: 1.3, range: "55% - 59%" },
    { min: 50, letter: "D", points: 1.0, range: "50% - 54%" },
    { min: 0, letter: "F", points: 0.0, range: "0% - 49%" }
  ];

  /* Status metadata used across the dashboard, course table,
     and course panels, so labels and classes stay consistent. */
  const STATUSES = {
    good: {
      key: "good",
      label: "Green - 80% and above",
      edgeClass: "edge-success",
      statusClass: "course-status--good"
    },
    warning: {
      key: "warning",
      label: "Yellow - 60% to 79%",
      edgeClass: "edge-warning",
      statusClass: "course-status--warning"
    },
    danger: {
      key: "danger",
      label: "Red - below 60%",
      edgeClass: "edge-danger",
      statusClass: "course-status--danger"
    },
    none: {
      key: "none",
      label: "No grades yet",
      edgeClass: "",
      statusClass: ""
    }
  };

  /* Sample data shown on first visit (matches the Phase 1 content). */
  const SEED_COURSES = [
    {
      code: "DIGT 1302",
      name: "Web Development Basics",
      credits: 3,
      target: 85,
      assignments: [
        { name: "Assignment 1 - HTML Basics", score: 90, weight: 15 },
        { name: "Assignment 2 - CSS Layout", score: 85, weight: 15 },
        { name: "Midterm Exam", score: 82, weight: 15 }
      ]
    },
    {
      code: "PSYC 1010",
      name: "Introduction to Psychology",
      credits: 3,
      target: 80,
      assignments: [
        { name: "Reflection Essay", score: 78, weight: 20 },
        { name: "Quiz Set", score: 72, weight: 15 },
        { name: "Midterm Test", score: 73, weight: 25 }
      ]
    },
    {
      code: "STAT 2020",
      name: "Statistics",
      credits: 4,
      target: 70,
      assignments: [
        { name: "Lab Report 1", score: 62, weight: 10 },
        { name: "Quiz 1", score: 55, weight: 10 },
        { name: "Midterm Exam", score: 56, weight: 20 }
      ]
    }
  ];

  /* ---------- Small utilities ---------- */

  /* "DIGT 1302" -> "digt-1302" (used for element ids and #links). */
  function slugify(code) {
    return String(code)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function cloneSeed() {
    return JSON.parse(JSON.stringify(SEED_COURSES));
  }

  /* ---------- Grade math (pure functions) ---------- */

  /* Total percentage of the course that has been graded so far. */
  function completedWeight(course) {
    return course.assignments.reduce(function (sum, a) {
      return sum + a.weight;
    }, 0);
  }

  function remainingWeight(course) {
    return Math.max(0, 100 - completedWeight(course));
  }

  /* Weighted average of graded work, or null when nothing is graded.
     Example: scoring 90% on an item worth 15% earns 13.5 points;
     the current grade is earned points out of the completed weight. */
  function currentGrade(course) {
    const done = completedWeight(course);
    if (done <= 0) {
      return null;
    }
    const earned = course.assignments.reduce(function (sum, a) {
      return sum + (a.score * a.weight) / 100;
    }, 0);
    return (earned / done) * 100;
  }

  function statusFor(grade) {
    if (grade === null) {
      return STATUSES.none;
    }
    if (grade >= 80) {
      return STATUSES.good;
    }
    if (grade >= 60) {
      return STATUSES.warning;
    }
    return STATUSES.danger;
  }

  /* Find the conversion-chart row for a percentage. */
  function scaleRowFor(percent) {
    const rounded = Math.round(percent);
    for (let i = 0; i < GPA_SCALE.length; i += 1) {
      if (rounded >= GPA_SCALE[i].min) {
        return GPA_SCALE[i];
      }
    }
    return GPA_SCALE[GPA_SCALE.length - 1];
  }

  function scaleRowIndexFor(percent) {
    return GPA_SCALE.indexOf(scaleRowFor(percent));
  }

  /* Weighted GPA from rows of { percent, credits }.
     Returns null when there are no usable rows. */
  function gpaFromRows(rows) {
    let totalCredits = 0;
    let totalPoints = 0;
    rows.forEach(function (row) {
      totalCredits += row.credits;
      totalPoints += scaleRowFor(row.percent).points * row.credits;
    });
    if (totalCredits <= 0) {
      return null;
    }
    return {
      gpa: totalPoints / totalCredits,
      totalCredits: totalCredits,
      totalPoints: totalPoints
    };
  }

  /* Overall GPA across courses that have at least one grade. */
  function overallGpa(courses) {
    const rows = [];
    courses.forEach(function (course) {
      const grade = currentGrade(course);
      if (grade !== null) {
        rows.push({ percent: grade, credits: course.credits });
      }
    });
    return gpaFromRows(rows);
  }

  function standingFor(gpa) {
    if (gpa >= 3.5) {
      return { label: "Excellent Standing", type: "success" };
    }
    if (gpa >= 2.0) {
      return { label: "Good Standing", type: "success" };
    }
    return { label: "Needs Attention", type: "warning" };
  }

  /* What-If math: the average score needed on `remaining` percent of
     the coursework to finish the course at `desired` percent overall. */
  function requiredScore(grade, completed, desired, remaining) {
    const earned = grade === null ? 0 : (grade * completed) / 100;
    return ((desired - earned) * 100) / remaining;
  }

  /* Best final grade still possible (perfect scores on all remaining work). */
  function maxPossibleFinal(grade, completed) {
    const earned = grade === null ? 0 : (grade * completed) / 100;
    return earned + (100 - completed);
  }

  /* ---------- localStorage persistence ---------- */

  /* Check that stored data still looks like a list of courses.
     Returns a cleaned copy, or null when the data is unusable. */
  function sanitizeCourses(value) {
    if (!Array.isArray(value)) {
      return null;
    }
    const cleaned = [];
    for (let i = 0; i < value.length; i += 1) {
      const course = value[i];
      if (!course || typeof course.code !== "string" || typeof course.name !== "string") {
        return null;
      }
      const credits = Number(course.credits);
      const target = Number(course.target);
      if (!(credits > 0) || Number.isNaN(target)) {
        return null;
      }
      const assignments = Array.isArray(course.assignments) ? course.assignments : [];
      const cleanAssignments = [];
      for (let j = 0; j < assignments.length; j += 1) {
        const item = assignments[j];
        const score = Number(item && item.score);
        const weight = Number(item && item.weight);
        if (!item || typeof item.name !== "string" || Number.isNaN(score) || !(weight > 0)) {
          return null;
        }
        cleanAssignments.push({ name: item.name, score: score, weight: weight });
      }
      cleaned.push({
        code: course.code,
        name: course.name,
        credits: credits,
        target: target,
        assignments: cleanAssignments
      });
    }
    return cleaned;
  }

  /* Load saved courses; fall back to the sample data when storage is
     empty, blocked (private browsing), or contains unusable data. */
  function loadCourses() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cleaned = sanitizeCourses(JSON.parse(raw));
        if (cleaned) {
          return cleaned;
        }
      }
    } catch (error) {
      /* Storage unavailable or corrupt - use the seed below. */
    }
    return cloneSeed();
  }

  function saveCourses(courses) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
      return true;
    } catch (error) {
      return false;
    }
  }

  /* Forget saved changes and return a fresh copy of the sample data. */
  function resetCourses() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* Nothing to clean up when storage is unavailable. */
    }
    return cloneSeed();
  }

  /* Public API for js/script.js (and for tests). */
  window.GradeGuardData = {
    GPA_SCALE: GPA_SCALE,
    STATUSES: STATUSES,
    slugify: slugify,
    completedWeight: completedWeight,
    remainingWeight: remainingWeight,
    currentGrade: currentGrade,
    statusFor: statusFor,
    scaleRowFor: scaleRowFor,
    scaleRowIndexFor: scaleRowIndexFor,
    gpaFromRows: gpaFromRows,
    overallGpa: overallGpa,
    standingFor: standingFor,
    requiredScore: requiredScore,
    maxPossibleFinal: maxPossibleFinal,
    loadCourses: loadCourses,
    saveCourses: saveCourses,
    resetCourses: resetCourses
  };
})();
