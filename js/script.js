/* =========================================================
   GradeGuard - page behaviour (Phase 3)
   ---------------------------------------------------------
   This file is the "view + controller" of the application:
     1. Small DOM helpers and a shared feedback-message system.
     2. Shared form-validation helpers with inline error messages.
     3. Renderers that build course rows, cards, and panels
       from the data in js/gradeguard-data.js.
     4. One initialiser per page, dispatched from the body class
       when the DOM is ready.
   All user-typed text is escaped before it is placed into
   innerHTML templates, so user input is never run as HTML.
   ========================================================= */
(function () {
  "use strict";

  const Data = window.GradeGuardData;

  /* =========================================
     1. Small DOM helpers
     ========================================= */

  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.from((scope || document).querySelectorAll(selector));
  }

  /* Escape user-provided text before using it inside an HTML
     template string. This prevents script injection (XSS). */
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function roundTenth(value) {
    return Math.round(value * 10) / 10;
  }

  function formatPercent(value) {
    return Math.round(value) + "%";
  }

  /* Scroll respecting the user's reduced-motion preference. */
  function scrollToElement(element) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  /* =========================================
     2. Page feedback messages
     ========================================= */

  /* Each host (a form or section) gets one reusable message box.
     Success/info messages use role="status", errors use
     role="alert" so screen readers announce them. */
  function ensureFeedbackBox(host) {
    let box = qs(":scope > .feedback", host);
    if (!box) {
      box = document.createElement("p");
      box.className = "feedback";
      const heading = qs(":scope > h2, :scope > h3", host);
      if (heading) {
        heading.insertAdjacentElement("afterend", box);
      } else {
        host.insertBefore(box, host.firstChild);
      }
    }
    return box;
  }

  function showFeedback(host, type, message) {
    const box = ensureFeedbackBox(host);
    box.className = "feedback feedback--" + type;
    box.setAttribute("role", type === "error" ? "alert" : "status");
    box.textContent = message;
    box.hidden = false;
  }

  function clearFeedback(host) {
    const box = qs(":scope > .feedback", host);
    if (box) {
      box.hidden = true;
      box.textContent = "";
    }
  }

  /* =========================================
     3. Field-level validation helpers
     ========================================= */

  function errorNoteFor(input) {
    const noteId = input.id + "-error";
    let note = document.getElementById(noteId);
    if (!note) {
      note = document.createElement("span");
      note.id = noteId;
      note.className = "field-error";
      if (input.type === "radio" || input.type === "checkbox") {
        input.closest("p").appendChild(note);
      } else {
        input.insertAdjacentElement("afterend", note);
      }
    }
    return note;
  }

  function setFieldError(input, message) {
    const note = errorNoteFor(input);
    note.textContent = message;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", note.id);
  }

  function clearFieldError(input) {
    const note = document.getElementById(input.id + "-error");
    if (note) {
      note.textContent = "";
    }
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }

  function clearAllFieldErrors(form) {
    qsa("[aria-invalid='true']", form).forEach(clearFieldError);
    qsa(".field-error", form).forEach(function (note) {
      note.textContent = "";
    });
  }

  /* Clear a field's error as soon as the user edits it, so
     feedback feels immediate rather than punishing. Also switch
     off the browser's native validation bubbles: JavaScript shows
     richer inline messages instead, while the HTML required/min/max
     attributes still protect visitors without JavaScript. */
  function attachLiveErrorClearing(form) {
    form.noValidate = true;
    function handle(event) {
      const field = event.target;
      if (!field.matches("input, select, textarea")) {
        return;
      }
      if (field.type === "radio") {
        const first = form.querySelector("input[name='" + field.name + "']");
        if (first) {
          clearFieldError(first);
        }
        return;
      }
      clearFieldError(field);
    }
    form.addEventListener("input", handle);
    form.addEventListener("change", handle);
  }

  /* Run a list of rules against a form. Each rule targets one field:
       { id, required, pattern, patternMsg, number: {min, max, msg},
         minLength: [n, msg], match: [otherId, msg], custom(value, form) }
     Radio groups use { radio: "name", required: msg } instead of id.
     Returns true when everything is valid; otherwise marks fields,
     shows a form-level error, and focuses the first invalid field. */
  function validateFields(form, rules) {
    clearFeedback(form);
    let firstInvalid = null;

    rules.forEach(function (rule) {
      let input;
      let message = null;

      if (rule.radio) {
        input = form.querySelector("input[name='" + rule.radio + "']");
        if (!input) {
          return;
        }
        if (!form.querySelector("input[name='" + rule.radio + "']:checked")) {
          message = rule.required;
        }
      } else {
        input = document.getElementById(rule.id);
        if (!input) {
          return;
        }
        message = checkRule(input, rule, form);
      }

      if (message) {
        setFieldError(input, message);
        if (!firstInvalid) {
          firstInvalid = input;
        }
      } else {
        clearFieldError(input);
      }
    });

    if (firstInvalid) {
      showFeedback(form, "error", "Please fix the highlighted fields and try again.");
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  function checkRule(input, rule, form) {
    const value = input.type === "checkbox" ? (input.checked ? "on" : "") : input.value.trim();

    if (value === "") {
      return rule.required || null;
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      return rule.patternMsg;
    }
    if (rule.minLength && value.length < rule.minLength[0]) {
      return rule.minLength[1];
    }
    if (rule.number) {
      const num = Number(value);
      if (Number.isNaN(num) || num < rule.number.min || num > rule.number.max) {
        return rule.number.msg;
      }
    }
    if (rule.match) {
      const other = document.getElementById(rule.match[0]);
      if (other && value !== other.value) {
        return rule.match[1];
      }
    }
    if (rule.custom) {
      return rule.custom(value, form);
    }
    return null;
  }

  /* Shared validators reused by several forms (DRY). */
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function phoneMessage(value) {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return "Enter a phone number with 10 to 15 digits.";
    }
    return null;
  }

  /* "digt1302" or "DIGT 1302" -> "DIGT 1302"; null when unusable. */
  function normalizeCourseCode(value) {
    const match = /^([A-Za-z]{2,5})\s*(\d{4})$/.exec(value.trim());
    return match ? match[1].toUpperCase() + " " + match[2] : null;
  }

  /* =========================================
     4. Shared course rendering + course forms
     ========================================= */

  function gradeText(grade) {
    return grade === null ? "No grades yet" : formatPercent(grade);
  }

  /* One table row for the My Courses table (built with
     createElement so text stays text, never HTML). */
  function courseTableRow(course) {
    const grade = Data.currentGrade(course);
    const status = Data.statusFor(grade);
    const slug = Data.slugify(course.code);
    const row = document.createElement("tr");
    row.dataset.search = (course.code + " " + course.name).toLowerCase();

    const cells = [
      ["Course Code", course.code],
      ["Course Name", course.name],
      ["Credit Hours", String(course.credits)],
      ["Current Grade", gradeText(grade)],
      ["Target Grade", course.target + "%"]
    ];
    cells.forEach(function (pair) {
      const td = document.createElement("td");
      td.setAttribute("data-label", pair[0]);
      td.textContent = pair[1];
      row.appendChild(td);
    });

    const statusCell = document.createElement("td");
    statusCell.setAttribute("data-label", "Status");
    if (status.key !== "none") {
      statusCell.setAttribute("data-status", status.key);
    }
    statusCell.textContent = status.label;
    row.appendChild(statusCell);

    const actionCell = document.createElement("td");
    actionCell.setAttribute("data-label", "Action");
    const link = document.createElement("a");
    link.href = "course-detail.html#" + slug;
    link.textContent = "View Details";
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "button-danger";
    removeButton.setAttribute("data-remove-course", course.code);
    removeButton.textContent = "Remove";
    actionCell.appendChild(link);
    actionCell.appendChild(removeButton);
    row.appendChild(actionCell);

    return row;
  }

  function renderCourseTable(tbody, courses) {
    tbody.textContent = "";
    if (courses.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "table-empty";
      cell.textContent = "No courses yet - add your first course using the form below.";
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }
    courses.forEach(function (course) {
      tbody.appendChild(courseTableRow(course));
    });
  }

  /* Add-course handler shared by the dashboard and My Courses
     forms. `ids` maps this form's input ids; `onAdded` re-renders
     whatever the page shows. */
  function handleAddCourse(form, courses, ids, onAdded) {
    const rules = [
      { id: ids.name, required: "Enter the course name." },
      {
        id: ids.code,
        required: "Enter the course code.",
        custom: function (value) {
          const code = normalizeCourseCode(value);
          if (!code) {
            return "Use a code like DIGT 1302 (2-5 letters and 4 digits).";
          }
          const slug = Data.slugify(code);
          const duplicate = courses.some(function (course) {
            return Data.slugify(course.code) === slug;
          });
          return duplicate ? "That course is already in your list." : null;
        }
      },
      {
        id: ids.credits,
        required: "Enter the credit hours.",
        number: { min: 0.5, max: 9, msg: "Credit hours must be between 0.5 and 9." }
      }
    ];
    if (ids.target) {
      rules.push({
        id: ids.target,
        required: "Enter a target grade.",
        number: { min: 0, max: 100, msg: "Target grade must be between 0 and 100." }
      });
    }

    if (!validateFields(form, rules)) {
      return;
    }

    const course = {
      code: normalizeCourseCode(document.getElementById(ids.code).value),
      name: document.getElementById(ids.name).value.trim(),
      credits: Number(document.getElementById(ids.credits).value),
      target: ids.target ? Number(document.getElementById(ids.target).value) : 85,
      assignments: []
    };
    courses.push(course);
    const saved = Data.saveCourses(courses);

    form.reset();
    let message = "Added " + course.code + " - " + course.name +
      " (target " + course.target + "%). It now has its own panel on the Course Details page.";
    if (!saved) {
      message += " Note: your browser blocked local storage, so this course lasts for this visit only.";
    }
    showFeedback(form, "success", message);
    onAdded(course);
  }

  /* =========================================
     5. Dashboard page (index.html)
     ========================================= */

  function dashboardCourseCard(course) {
    const grade = Data.currentGrade(course);
    const status = Data.statusFor(grade);
    const completed = Data.completedWeight(course);
    const slug = Data.slugify(course.code);

    const article = document.createElement("article");
    article.className = "course-card edge-top-thick";
    if (status.edgeClass) {
      article.classList.add(status.edgeClass);
    }
    if (status.key === "danger") {
      article.classList.add("course-card--danger");
    }

    const alertHtml = status.key === "danger"
      ? '<p class="course-alert edge-left edge-danger">Priority review recommended before the next major assessment.</p>'
      : "";
    const statusClass = status.statusClass ? " " + status.statusClass : "";

    article.innerHTML =
      "<h3>" + escapeHtml(course.code) + " - " + escapeHtml(course.name) + "</h3>" +
      "<p><strong>Credit Hours:</strong> " + course.credits + "</p>" +
      '<p><strong>Current Grade:</strong> <span class="course-grade">' +
      (grade === null ? "-" : formatPercent(grade)) + "</span></p>" +
      '<p class="course-status' + statusClass + '"><strong>Status:</strong> ' + status.label + "</p>" +
      "<p><strong>Completed Weight:</strong> " + completed + "%</p>" +
      alertHtml +
      '<progress max="100" value="' + completed + '">' + completed + "%</progress>" +
      '<ul class="course-actions">' +
      '<li><a href="course-detail.html#' + slug + '">View course details</a></li>' +
      '<li><a href="course-detail.html#' + slug + '-what-if-calculator">Use What-If Calculator</a></li>' +
      "</ul>";
    return article;
  }

  function renderDashboard(courses) {
    const overall = Data.overallGpa(courses);
    const gpaText = overall ? overall.gpa.toFixed(2) : "N/A";
    const attention = courses.filter(function (course) {
      return Data.statusFor(Data.currentGrade(course)).key === "danger";
    }).length;

    const metricGpa = document.getElementById("metric-current-gpa");
    const metricCourses = document.getElementById("metric-active-courses");
    const metricAttention = document.getElementById("metric-attention");
    if (metricGpa) {
      metricGpa.textContent = overall ? gpaText + " / 4.00" : "N/A";
    }
    if (metricCourses) {
      metricCourses.textContent = String(courses.length);
    }
    if (metricAttention) {
      metricAttention.textContent = attention + (attention === 1 ? " course" : " courses");
    }

    const summaryValue = document.getElementById("summary-gpa-value");
    if (summaryValue) {
      summaryValue.innerHTML = gpaText + " <span>/ 4.00</span>";
    }
    const meter = document.getElementById("summary-gpa-meter");
    if (meter) {
      meter.value = overall ? overall.gpa : 0;
      meter.textContent = gpaText + " out of 4.00";
    }
    const standingBox = document.getElementById("summary-standing");
    if (standingBox) {
      if (overall) {
        const standing = Data.standingFor(overall.gpa);
        standingBox.className = "summary-status summary-status--" +
          (standing.type === "success" ? "good" : "warning");
        standingBox.textContent = standing.label;
      } else {
        standingBox.className = "summary-status";
        standingBox.textContent = "No grades yet";
      }
    }
    const atRisk = document.getElementById("at-risk-note");
    if (atRisk) {
      atRisk.innerHTML = "<strong>At-risk courses:</strong> " +
        (attention === 0
          ? "no courses currently need attention."
          : attention + (attention === 1 ? " course currently needs" : " courses currently need") + " attention.");
    }

    const coursesSection = qs(".dashboard-courses");
    if (coursesSection) {
      qsa(".course-card", coursesSection).forEach(function (card) {
        card.remove();
      });
      if (courses.length === 0) {
        showFeedback(coursesSection, "info",
          "No courses yet - add your first course with the form below.");
      } else {
        clearFeedback(coursesSection);
        courses.forEach(function (course) {
          coursesSection.appendChild(dashboardCourseCard(course));
        });
      }
    }
  }

  function initDashboardPage(courses) {
    renderDashboard(courses);

    /* Greet a signed-in student by name. */
    const account = Data.loadAccount();
    const session = Data.loadSession();
    const welcome = document.getElementById("welcome-heading");
    if (welcome && account && session &&
        session.email.toLowerCase() === account.email.toLowerCase()) {
      welcome.textContent = "Welcome back, " + account.firstName + "!";
    }
    const form = document.getElementById("dashboard-add-course-form");
    if (form) {
      attachLiveErrorClearing(form);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        handleAddCourse(form, courses,
          { name: "course-name", code: "course-code", credits: "credit-hours" },
          function () {
            renderDashboard(courses);
          });
      });
    }
  }

  /* =========================================
     6. My Courses page (courses.html)
     ========================================= */

  function initCoursesPage(courses) {
    const tbody = document.getElementById("course-table-body");
    const listSection = tbody ? tbody.closest("section") : null;
    if (!tbody) {
      return;
    }

    /* Search box and result counter are injected by JavaScript
       because they only work when JavaScript is available. */
    const heading = document.getElementById("course-list-heading");
    const searchBlock = document.createElement("p");
    searchBlock.className = "course-search";
    searchBlock.innerHTML =
      '<label for="course-search">Search your courses</label><br>' +
      '<input type="search" id="course-search" placeholder="Type a course code or name (Esc clears)">';
    heading.insertAdjacentElement("afterend", searchBlock);
    const counter = document.createElement("p");
    counter.id = "course-search-count";
    counter.className = "filter-note";
    counter.setAttribute("role", "status");
    searchBlock.insertAdjacentElement("afterend", counter);
    const searchInput = document.getElementById("course-search");

    function applySearch() {
      const query = searchInput.value.trim().toLowerCase();
      const rows = qsa("tr[data-search]", tbody);
      let shown = 0;
      rows.forEach(function (row) {
        const match = !query || row.dataset.search.includes(query);
        row.hidden = !match;
        if (match) {
          shown += 1;
        }
      });
      counter.textContent = query
        ? "Showing " + shown + " of " + rows.length + " courses for \"" + searchInput.value.trim() + "\"."
        : "Showing all " + rows.length + (rows.length === 1 ? " course." : " courses.");
      if (query && shown === 0) {
        counter.textContent = "No courses match \"" + searchInput.value.trim() + "\". Press Esc to clear the search.";
      }
    }

    function refreshTable() {
      renderCourseTable(tbody, courses);
      applySearch();
    }

    searchInput.addEventListener("input", applySearch);
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        searchInput.value = "";
        applySearch();
      }
    });

    /* Event delegation: one listener handles the Remove button in
       every row, including rows created after this code runs. */
    tbody.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-remove-course]");
      if (!button) {
        return;
      }
      const code = button.getAttribute("data-remove-course");
      const index = courses.findIndex(function (course) {
        return course.code === code;
      });
      if (index === -1) {
        return;
      }
      const course = courses[index];
      const confirmed = window.confirm(
        "Remove " + course.code + " - " + course.name + "? Its assignments will be deleted too.");
      if (!confirmed) {
        return;
      }
      courses.splice(index, 1);
      Data.saveCourses(courses);
      refreshTable();
      showFeedback(listSection, "success", "Removed " + course.code + " - " + course.name + ".");
    });

    /* Restore-sample-data button (also injected: JavaScript-only). */
    const resetBlock = document.createElement("p");
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.id = "restore-sample-data";
    resetButton.className = "button-quiet";
    resetButton.textContent = "Restore sample data";
    resetBlock.appendChild(resetButton);
    listSection.appendChild(resetBlock);
    resetButton.addEventListener("click", function () {
      const fresh = Data.resetCourses();
      courses.length = 0;
      fresh.forEach(function (course) {
        courses.push(course);
      });
      Data.saveCourses(courses);
      searchInput.value = "";
      refreshTable();
      showFeedback(listSection, "info", "Sample data restored. Your saved changes were cleared.");
    });

    const form = document.getElementById("add-course-form");
    if (form) {
      attachLiveErrorClearing(form);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        handleAddCourse(form, courses,
          { name: "course-name", code: "course-code", credits: "credit-hours", target: "target-grade" },
          refreshTable);
      });
    }

    refreshTable();
  }

  /* =========================================
     7. Course Details page (course-detail.html)
     ========================================= */

  function assignmentRow(course, assignment, index) {
    const row = document.createElement("tr");
    const cells = [
      ["Assignment Name", assignment.name],
      ["Your Score (%)", assignment.score + "%"],
      ["Weight (%)", assignment.weight + "%"]
    ];
    cells.forEach(function (pair) {
      const td = document.createElement("td");
      td.setAttribute("data-label", pair[0]);
      td.textContent = pair[1];
      row.appendChild(td);
    });
    const actionCell = document.createElement("td");
    actionCell.setAttribute("data-label", "Action");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button-danger";
    button.textContent = "Remove";
    button.setAttribute("data-remove-assignment", String(index));
    button.setAttribute("data-course", course.code);
    actionCell.appendChild(button);
    row.appendChild(actionCell);
    return row;
  }

  /* Build one collapsible course panel. Data values are escaped
     because this template is inserted with innerHTML. */
  function coursePanelHtml(course, isOpen) {
    const slug = Data.slugify(course.code);
    const code = escapeHtml(course.code);
    const name = escapeHtml(course.name);
    const remaining = Data.remainingWeight(course);

    return '' +
      '<details id="' + slug + '" class="course-panel edge-top-thick"' + (isOpen ? " open" : "") + '>\n' +
      '  <summary><h2 id="' + slug + '-heading">' + code + " - " + name + "</h2></summary>\n" +
      '  <div class="course-body">\n' +
      '    <section aria-labelledby="' + slug + '-info-heading">\n' +
      '      <h3 id="' + slug + '-info-heading">Course Information</h3>\n' +
      "      <p><strong>Course Code:</strong> " + code + "</p>\n" +
      "      <p><strong>Credit Hours:</strong> " + course.credits + "</p>\n" +
      "      <p><strong>Target Grade:</strong> " + course.target + "%</p>\n" +
      "    </section>\n" +
      '    <section aria-labelledby="' + slug + '-grade-heading">\n' +
      '      <h3 id="' + slug + '-grade-heading">Current Weighted Grade</h3>\n' +
      '      <p><strong>Current calculated grade:</strong> <span class="current-grade-value">-</span></p>\n' +
      '      <p><strong>Completed coursework weight:</strong> <span class="completed-weight-value">-</span></p>\n' +
      '      <p><strong>Remaining coursework weight:</strong> <span class="remaining-weight-value">-</span></p>\n' +
      '      <progress max="100" value="0">0%</progress>\n' +
      '      <p><strong>Status:</strong> <span class="status-value">-</span></p>\n' +
      "    </section>\n" +
      '    <section aria-labelledby="' + slug + '-assignments-heading">\n' +
      '      <h3 id="' + slug + '-assignments-heading">Assignments</h3>\n' +
      '      <table aria-label="' + code + ' assignment list showing scores and weights">\n' +
      "        <thead>\n          <tr>\n" +
      '            <th scope="col">Assignment Name</th>\n' +
      '            <th scope="col">Your Score (%)</th>\n' +
      '            <th scope="col">Weight (%)</th>\n' +
      '            <th scope="col">Action</th>\n' +
      "          </tr>\n        </thead>\n" +
      '        <tbody data-assignments="' + slug + '"></tbody>\n' +
      "      </table>\n" +
      '      <p class="assignment-empty" hidden>No assignments yet - add the first one using the form.</p>\n' +
      "    </section>\n" +
      '    <section aria-labelledby="' + slug + '-add-heading">\n' +
      '      <h3 id="' + slug + '-add-heading">Add an Assignment</h3>\n' +
      '      <form data-role="add-assignment" data-course="' + code + '" action="#' + slug + '" method="get">\n' +
      "        <p>\n" +
      '          <label for="' + slug + '-assignment-name">Assignment Name</label><br>\n' +
      '          <input type="text" id="' + slug + '-assignment-name" placeholder="Example: Final Project">\n' +
      "        </p>\n        <p>\n" +
      '          <label for="' + slug + '-assignment-score">Your Score (%)</label><br>\n' +
      '          <input type="number" id="' + slug + '-assignment-score" min="0" max="100" step="0.1" placeholder="Example: 88">\n' +
      "        </p>\n        <p>\n" +
      '          <label for="' + slug + '-assignment-weight">Weight Toward Final Grade (%)</label><br>\n' +
      '          <input type="number" id="' + slug + '-assignment-weight" min="1" max="100" step="0.5" placeholder="Example: 25">\n' +
      "        </p>\n" +
      '        <p><button type="submit">Add Assignment</button></p>\n' +
      "      </form>\n" +
      "    </section>\n" +
      '    <section aria-labelledby="' + slug + '-whatif-heading" id="' + slug + '-what-if-calculator">\n' +
      '      <h3 id="' + slug + '-whatif-heading">What-If Calculator</h3>\n' +
      '      <p class="what-if-summary">-</p>\n' +
      '      <form data-role="what-if" data-course="' + code + '" action="#' + slug + '-what-if-calculator" method="get">\n' +
      "        <p>\n" +
      '          <label for="' + slug + '-desired-grade">Desired Final Grade (%)</label><br>\n' +
      '          <input type="number" id="' + slug + '-desired-grade" min="0" max="100" step="0.1" value="' + course.target + '">\n' +
      "        </p>\n        <p>\n" +
      '          <label for="' + slug + '-remaining-weight">Weight of Remaining Assessments (%)</label><br>\n' +
      '          <input type="number" id="' + slug + '-remaining-weight" min="1" max="100" step="0.5" value="' + remaining + '" data-autofill="true">\n' +
      "        </p>\n" +
      '        <p><button type="submit">Calculate Required Score</button></p>\n' +
      "      </form>\n" +
      '      <p class="what-if-result" role="status" hidden></p>\n' +
      "    </section>\n" +
      "  </div>\n" +
      "</details>";
  }

  /* Refresh every calculated value inside one course panel. */
  function refreshCoursePanel(course) {
    const slug = Data.slugify(course.code);
    const panel = document.getElementById(slug);
    if (!panel) {
      return;
    }
    const grade = Data.currentGrade(course);
    const status = Data.statusFor(grade);
    const completed = Data.completedWeight(course);
    const remaining = Data.remainingWeight(course);

    qs(".current-grade-value", panel).textContent = gradeText(grade);
    qs(".completed-weight-value", panel).textContent = completed + "%";
    qs(".remaining-weight-value", panel).textContent = remaining + "%";
    qs(".status-value", panel).textContent = status.label;
    const progress = qs("progress", panel);
    progress.value = completed;
    progress.textContent = completed + "%";

    panel.classList.remove("edge-success", "edge-warning", "edge-danger");
    if (status.edgeClass) {
      panel.classList.add(status.edgeClass);
    }

    const tbody = qs("tbody[data-assignments='" + slug + "']", panel);
    tbody.textContent = "";
    course.assignments.forEach(function (assignment, index) {
      tbody.appendChild(assignmentRow(course, assignment, index));
    });
    qs(".assignment-empty", panel).hidden = course.assignments.length > 0;

    const summary = qs(".what-if-summary", panel);
    if (remaining === 0) {
      summary.textContent = "All 100% of the coursework is graded. Final grade: " + gradeText(grade) + ".";
    } else {
      const required = Data.requiredScore(grade, completed, course.target, remaining);
      summary.textContent = "To finish with " + course.target + "%, this course currently requires about " +
        roundTenth(Math.max(0, required)) + "% on the remaining " + remaining + "% of the coursework.";
    }

    /* Keep the remaining-weight field in sync until the user edits it. */
    const remainingInput = document.getElementById(slug + "-remaining-weight");
    if (remainingInput && remainingInput.dataset.autofill === "true") {
      remainingInput.value = remaining > 0 ? String(remaining) : "";
    }
  }

  function findCourseByCode(courses, code) {
    return courses.find(function (course) {
      return course.code === code;
    }) || null;
  }

  function updateWhatIfResult(course, form, options) {
    const slug = Data.slugify(course.code);
    const result = qs(".what-if-result", form.closest("section"));
    const desiredInput = document.getElementById(slug + "-desired-grade");
    const remainingInput = document.getElementById(slug + "-remaining-weight");
    const desired = Number(desiredInput.value);
    const remaining = Number(remainingInput.value);

    const usable = desiredInput.value.trim() !== "" && remainingInput.value.trim() !== "" &&
      !Number.isNaN(desired) && !Number.isNaN(remaining) &&
      desired >= 0 && desired <= 100 && remaining >= 1 && remaining <= 100;
    if (!usable) {
      if (options && options.live) {
        return;
      }
      result.hidden = true;
      return;
    }

    const grade = Data.currentGrade(course);
    const completed = Data.completedWeight(course);
    const required = roundTenth(Data.requiredScore(grade, completed, desired, remaining));

    let type;
    let message;
    if (required <= 0) {
      type = "success";
      message = "Target secured! Even 0% on the remaining " + remaining +
        "% still finishes the course at or above " + desired + "%.";
    } else if (required <= 85) {
      type = "success";
      message = "You need an average of " + required + "% on the remaining " + remaining +
        "% of the coursework to finish with " + desired + "%. Very doable - keep going!";
    } else if (required <= 100) {
      type = "warning";
      message = "You need an average of " + required + "% on the remaining " + remaining +
        "% of the coursework to finish with " + desired + "%. Challenging, but still possible.";
    } else {
      type = "error";
      const best = Math.floor(Data.maxPossibleFinal(grade, completed));
      message = "Not possible: reaching " + desired + "% would need " + required +
        "% on the remaining work. The best final grade still available is about " + best + "%.";
    }
    result.className = "what-if-result feedback feedback--" + type;
    result.hidden = false;
    result.textContent = message;
  }

  function wireCoursePanel(course) {
    const slug = Data.slugify(course.code);
    const panel = document.getElementById(slug);
    if (!panel) {
      return;
    }

    const addForm = qs("form[data-role='add-assignment']", panel);
    attachLiveErrorClearing(addForm);
    addForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const remaining = Data.remainingWeight(course);
      const valid = validateFields(addForm, [
        {
          id: slug + "-assignment-name",
          required: "Enter the assignment name.",
          custom: function (value) {
            const duplicate = course.assignments.some(function (assignment) {
              return assignment.name.toLowerCase() === value.toLowerCase();
            });
            return duplicate ? "That assignment is already listed for this course." : null;
          }
        },
        {
          id: slug + "-assignment-score",
          required: "Enter the score you received.",
          number: { min: 0, max: 100, msg: "Score must be between 0 and 100." }
        },
        {
          id: slug + "-assignment-weight",
          required: "Enter the weight of this assignment.",
          number: { min: 1, max: 100, msg: "Weight must be between 1 and 100." },
          custom: function (value) {
            return Number(value) > remaining
              ? "Only " + remaining + "% of the course weight remains ungraded."
              : null;
          }
        }
      ]);
      if (!valid) {
        return;
      }
      const assignment = {
        name: document.getElementById(slug + "-assignment-name").value.trim(),
        score: Number(document.getElementById(slug + "-assignment-score").value),
        weight: Number(document.getElementById(slug + "-assignment-weight").value)
      };
      course.assignments.push(assignment);
      Data.saveCourses(coursesState);
      addForm.reset();
      refreshCoursePanel(course);
      updateWhatIfResult(course, qs("form[data-role='what-if']", panel), { live: true });
      showFeedback(addForm, "success",
        'Added "' + assignment.name + '" (' + assignment.weight +
        "% of the grade). Your current grade is now " + gradeText(Data.currentGrade(course)) + ".");
    });

    const whatIfForm = qs("form[data-role='what-if']", panel);
    attachLiveErrorClearing(whatIfForm);
    whatIfForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const valid = validateFields(whatIfForm, [
        {
          id: slug + "-desired-grade",
          required: "Enter your desired final grade.",
          number: { min: 0, max: 100, msg: "Desired grade must be between 0 and 100." }
        },
        {
          id: slug + "-remaining-weight",
          required: "Enter the remaining assessment weight.",
          number: { min: 1, max: 100, msg: "Remaining weight must be between 1 and 100." }
        }
      ]);
      if (valid) {
        updateWhatIfResult(course, whatIfForm, { live: false });
      }
    });
    /* Live recalculation while typing. */
    qsa("input", whatIfForm).forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.id === slug + "-remaining-weight") {
          input.dataset.autofill = "false";
        }
        updateWhatIfResult(course, whatIfForm, { live: true });
      });
    });
  }

  /* Track the shared course list so nested handlers can save it. */
  let coursesState = [];

  function renderCoursePanels(courses) {
    const anchor = document.getElementById("course-tools");
    if (!anchor) {
      return;
    }

    /* Rebuild the jump links to match the real course list. */
    const jumpList = qs("ul", anchor);
    jumpList.textContent = "";
    courses.forEach(function (course) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = "#" + Data.slugify(course.code);
      link.textContent = course.code + " - " + course.name;
      item.appendChild(link);
      jumpList.appendChild(item);
    });

    /* Replace the static panels with panels built from data. */
    qsa("details.course-panel").forEach(function (panel) {
      panel.remove();
    });
    const oldEmpty = document.getElementById("no-courses-note");
    if (oldEmpty) {
      oldEmpty.remove();
    }

    if (courses.length === 0) {
      anchor.insertAdjacentHTML("afterend",
        '<section id="no-courses-note" aria-label="No courses">' +
        '<p>No courses yet. Add one on the <a href="courses.html">My Courses</a> page and it will appear here automatically.</p>' +
        "</section>");
      return;
    }

    const requestedSlug = window.location.hash.slice(1);
    const openSlug = courses.some(function (course) {
      return Data.slugify(course.code) === requestedSlug;
    }) ? requestedSlug : Data.slugify(courses[0].code);

    const html = courses.map(function (course) {
      return coursePanelHtml(course, Data.slugify(course.code) === openSlug);
    }).join("\n");
    anchor.insertAdjacentHTML("afterend", html);

    courses.forEach(function (course) {
      refreshCoursePanel(course);
      wireCoursePanel(course);
    });
  }

  /* Deep links: opening #psyc-1010 (or a section inside it) should
     expand that panel - closed <details> would otherwise hide it. */
  function openPanelFromHash() {
    const id = window.location.hash.slice(1);
    if (!id) {
      return;
    }
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    const panel = target.closest("details.course-panel");
    if (panel) {
      panel.open = true;
      scrollToElement(panel);
    }
  }

  function initCourseDetailPage(courses) {
    coursesState = courses;
    renderCoursePanels(courses);
    openPanelFromHash();
    window.addEventListener("hashchange", openPanelFromHash);

    /* Event delegation for every Remove-assignment button. */
    document.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-remove-assignment]");
      if (!button) {
        return;
      }
      const course = findCourseByCode(courses, button.getAttribute("data-course"));
      if (!course) {
        return;
      }
      const index = Number(button.getAttribute("data-remove-assignment"));
      const removed = course.assignments.splice(index, 1)[0];
      Data.saveCourses(courses);
      refreshCoursePanel(course);
      const section = document.getElementById(Data.slugify(course.code) + "-assignments-heading").closest("section");
      showFeedback(section, "success",
        'Removed "' + removed.name + '". The course grade has been updated.');
    });
  }

  /* =========================================
     8. GPA Calculator page (gpa-calculator.html)
     ========================================= */

  function gpaFieldsetHtml(index) {
    return "<fieldset>\n" +
      "  <legend>Course " + index + "</legend>\n" +
      "  <p>\n" +
      '    <label for="course-' + index + '-name">Course Name</label><br>\n' +
      '    <input type="text" id="course-' + index + '-name" name="course-' + index + '-name" placeholder="Example: Another course">\n' +
      "  </p>\n  <p>\n" +
      '    <label for="course-' + index + '-grade">Course Percentage</label><br>\n' +
      '    <input type="number" id="course-' + index + '-grade" name="course-' + index + '-grade" min="0" max="100" step="0.01" placeholder="Example: 82">\n' +
      "  </p>\n  <p>\n" +
      '    <label for="course-' + index + '-credits">Credit Hours</label><br>\n' +
      '    <input type="number" id="course-' + index + '-credits" name="course-' + index + '-credits" min="0" step="0.5" placeholder="Example: 3">\n' +
      "  </p>\n" +
      "</fieldset>";
  }

  function renderGpaResult(area, calculation, scale) {
    const rowsHtml = calculation.rows.map(function (row) {
      return "<tr>" +
        '<td data-label="Course">' + escapeHtml(row.name) + "</td>" +
        '<td data-label="Percentage">' + row.percent + "%</td>" +
        '<td data-label="Letter Grade">' + row.letter + "</td>" +
        '<td data-label="GPA Points">' + row.points.toFixed(1) + "</td>" +
        '<td data-label="Credit Hours">' + row.credits + "</td>" +
        '<td data-label="Weighted Points">' + roundTenth(row.weighted) + "</td>" +
        "</tr>";
    }).join("");

    let scaleNote = "";
    let gpaLine = "<strong>Overall GPA: " + calculation.gpa.toFixed(2) + " on the 4.0 scale.</strong>";
    if (scale !== 4) {
      const converted = (calculation.gpa / 4) * scale;
      scaleNote = " (about " + converted.toFixed(2) + " on the " + scale +
        " scale, using an approximate linear conversion)";
      gpaLine = "<strong>Overall GPA: " + calculation.gpa.toFixed(2) + " on the 4.0 scale" +
        escapeHtml(scaleNote) + ".</strong>";
    }

    const standing = Data.standingFor(calculation.gpa);
    const standingExtra = standing.type === "warning"
      ? " Focus on the courses pulling the average down - the What-If Calculator on the Course Details page can help you plan."
      : " Keep up the good work!";

    area.innerHTML =
      "<h3>Your GPA Result</h3>" +
      "<table>" +
      "<caption>Calculated GPA breakdown</caption>" +
      "<thead><tr>" +
      '<th scope="col">Course</th><th scope="col">Percentage</th><th scope="col">Letter Grade</th>' +
      '<th scope="col">GPA Points</th><th scope="col">Credit Hours</th><th scope="col">Weighted Points</th>' +
      "</tr></thead>" +
      "<tbody>" + rowsHtml + "</tbody>" +
      "<tfoot><tr>" +
      '<th scope="row" colspan="4">Totals</th>' +
      '<td data-label="Credit Hours">' + calculation.totalCredits + "</td>" +
      '<td data-label="Weighted Points">' + roundTenth(calculation.totalPoints) + "</td>" +
      "</tr></tfoot></table>" +
      "<p>" + gpaLine + "</p>" +
      '<p class="feedback feedback--' + standing.type + '" role="status">Academic standing: ' +
      standing.label + "." + standingExtra + "</p>";
  }

  function initGpaCalculatorPage() {
    const form = document.getElementById("gpa-calculator-form");
    const area = document.getElementById("gpa-result-area");
    if (!form || !area) {
      return;
    }
    const initialAreaHtml = area.innerHTML;
    const scaleSelect = document.getElementById("calculator-scale");
    let lastCalculation = null;

    attachLiveErrorClearing(form);

    /* "Add Another Course" button (JavaScript-only feature). */
    const addBlock = document.createElement("p");
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.id = "add-gpa-course";
    addButton.className = "button-quiet";
    addButton.textContent = "+ Add Another Course";
    addBlock.appendChild(addButton);
    const submitBlock = qs("button[type='submit']", form).closest("p");
    form.insertBefore(addBlock, submitBlock);

    addButton.addEventListener("click", function () {
      const count = qsa("fieldset", form).length;
      if (count >= 10) {
        showFeedback(form, "warning", "This calculator supports up to 10 courses.");
        return;
      }
      const last = qsa("fieldset", form)[count - 1];
      last.insertAdjacentHTML("afterend", gpaFieldsetHtml(count + 1));
      document.getElementById("course-" + (count + 1) + "-name").focus();
    });

    function collectRows() {
      const rows = [];
      let hasErrors = false;
      qsa("fieldset", form).forEach(function (fieldset, position) {
        const inputs = qsa("input", fieldset);
        const nameInput = inputs[0];
        const gradeInput = inputs[1];
        const creditsInput = inputs[2];
        const values = inputs.map(function (input) {
          return input.value.trim();
        });
        if (values.every(function (value) { return value === ""; })) {
          return; /* Completely empty row - skip it. */
        }
        let rowValid = true;
        const grade = Number(values[1]);
        if (values[1] === "" || Number.isNaN(grade) || grade < 0 || grade > 100) {
          setFieldError(gradeInput, "Enter a percentage between 0 and 100.");
          rowValid = false;
        }
        const credits = Number(values[2]);
        if (values[2] === "" || Number.isNaN(credits) || credits <= 0 || credits > 9) {
          setFieldError(creditsInput, "Enter credit hours between 0.5 and 9.");
          rowValid = false;
        }
        if (!rowValid) {
          hasErrors = true;
          return;
        }
        const scaleRow = Data.scaleRowFor(grade);
        rows.push({
          name: values[0] || "Course " + (position + 1),
          percent: grade,
          letter: scaleRow.letter,
          points: scaleRow.points,
          credits: credits,
          weighted: scaleRow.points * credits
        });
      });
      return { rows: rows, hasErrors: hasErrors };
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearAllFieldErrors(form);
      clearFeedback(form);
      const collected = collectRows();
      if (collected.hasErrors) {
        showFeedback(form, "error", "Please fix the highlighted fields and try again.");
        return;
      }
      if (collected.rows.length === 0) {
        showFeedback(form, "error",
          "Enter at least one course with a percentage and credit hours.");
        return;
      }
      const totals = Data.gpaFromRows(collected.rows);
      lastCalculation = {
        rows: collected.rows,
        gpa: totals.gpa,
        totalCredits: totals.totalCredits,
        totalPoints: totals.totalPoints
      };
      renderGpaResult(area, lastCalculation, Number(scaleSelect.value));
      showFeedback(form, "success",
        "GPA calculated from " + collected.rows.length +
        (collected.rows.length === 1 ? " course." : " courses.") + " See your result below.");
      scrollToElement(area);
    });

    /* Recalculate the displayed scale when the dropdown changes. */
    scaleSelect.addEventListener("change", function () {
      if (lastCalculation) {
        renderGpaResult(area, lastCalculation, Number(scaleSelect.value));
      }
    });

    qs("button[type='reset']", form).addEventListener("click", function () {
      clearAllFieldErrors(form);
      clearFeedback(form);
      qsa("fieldset", form).slice(3).forEach(function (fieldset) {
        fieldset.remove();
      });
      area.innerHTML = initialAreaHtml;
      lastCalculation = null;
    });
  }

  /* =========================================
     9. GPA Overview page (gpa-overview.html)
     ========================================= */

  function initGpaOverviewPage() {
    const section = qs("section[aria-labelledby='scale-heading']");
    if (!section) {
      return;
    }
    const chartRows = qsa("table tbody tr", section);

    /* The try-it widget is injected because it needs JavaScript. */
    const intro = qs("p", section);
    intro.insertAdjacentHTML("afterend",
      '<p class="grade-lookup">' +
      '<label for="grade-lookup-input">Try it - type a percentage to find the matching row</label><br>' +
      '<input type="number" id="grade-lookup-input" min="0" max="100" step="0.1" placeholder="Example: 86">' +
      "</p>" +
      '<p id="grade-lookup-result" class="filter-note" role="status"></p>');
    const input = document.getElementById("grade-lookup-input");
    const result = document.getElementById("grade-lookup-result");

    function clearHighlight() {
      chartRows.forEach(function (row) {
        row.classList.remove("chart-highlight");
      });
    }

    function describeTyped() {
      const raw = input.value.trim();
      clearHighlight();
      if (raw === "") {
        result.textContent = "";
        return;
      }
      const percent = Number(raw);
      if (Number.isNaN(percent) || percent < 0 || percent > 100) {
        result.textContent = "Enter a number between 0 and 100.";
        return;
      }
      const row = Data.scaleRowFor(percent);
      const index = Data.scaleRowIndexFor(percent);
      if (chartRows[index]) {
        chartRows[index].classList.add("chart-highlight");
      }
      result.textContent = percent + "% = " + row.letter + " (" +
        row.points.toFixed(1) + " GPA points, bracket " + row.range + ").";
    }

    input.addEventListener("input", describeTyped);

    /* Hovering a chart row previews it; leaving restores the typed value. */
    chartRows.forEach(function (row) {
      row.addEventListener("mouseover", function () {
        const cells = qsa("td", row);
        result.textContent = "Hovering: " + cells[0].textContent + " = " +
          cells[1].textContent + " (" + cells[2].textContent + " GPA points).";
      });
      row.addEventListener("mouseout", describeTyped);
    });
  }

  /* =========================================
     10. FAQ page (faq.html)
     ========================================= */

  function initFaqPage() {
    const form = document.getElementById("faq-filter-form");
    const search = document.getElementById("faq-search");
    const topicSelect = document.getElementById("faq-topic");
    if (!form || !search || !topicSelect) {
      return;
    }

    const TOPIC_SECTIONS = {
      general: "general-questions",
      grades: "grade-questions",
      gpa: "gpa-questions",
      privacy: "privacy-questions",
      troubleshooting: "troubleshooting-questions"
    };

    const counter = document.createElement("p");
    counter.id = "faq-filter-count";
    counter.className = "filter-note";
    counter.setAttribute("role", "status");
    form.insertAdjacentElement("afterend", counter);

    function applyFilter() {
      const query = search.value.trim().toLowerCase();
      const topic = topicSelect.value;
      let total = 0;
      let shown = 0;

      Object.keys(TOPIC_SECTIONS).forEach(function (key) {
        const section = document.getElementById(TOPIC_SECTIONS[key]);
        if (!section) {
          return;
        }
        const sectionVisible = topic === "all-topics" || topic === key;
        let sectionMatches = 0;
        qsa("details", section).forEach(function (item) {
          total += 1;
          const matches = sectionVisible &&
            (!query || item.textContent.toLowerCase().includes(query));
          item.hidden = !matches;
          if (matches) {
            sectionMatches += 1;
            shown += 1;
            if (query) {
              item.open = true;
            }
          }
        });
        section.hidden = !sectionVisible || sectionMatches === 0;
      });

      if (shown === 0) {
        counter.textContent = "No answers match" +
          (query ? ' "' + search.value.trim() + '"' : " that topic") +
          ". Try clearing the search (Esc) or choosing All Topics.";
      } else {
        counter.textContent = "Showing " + shown + " of " + total + " answers" +
          (query ? ' for "' + search.value.trim() + '"' : "") + ".";
      }
    }

    search.addEventListener("input", applyFilter);
    search.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        search.value = "";
        applyFilter();
      }
    });
    topicSelect.addEventListener("change", applyFilter);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      applyFilter();
    });

    /* Expand-all / collapse-all controls (JavaScript-only feature). */
    const topicNav = qs("nav[aria-label='FAQ topic navigation']");
    if (topicNav) {
      const controls = document.createElement("p");
      controls.className = "faq-controls";
      const expandButton = document.createElement("button");
      expandButton.type = "button";
      expandButton.className = "button-quiet";
      expandButton.textContent = "Expand all answers";
      const collapseButton = document.createElement("button");
      collapseButton.type = "button";
      collapseButton.className = "button-quiet";
      collapseButton.textContent = "Collapse all answers";
      controls.appendChild(expandButton);
      controls.appendChild(collapseButton);
      topicNav.appendChild(controls);

      function setAll(open) {
        qsa("section[id$='-questions'] details").forEach(function (item) {
          if (!item.hidden) {
            item.open = open;
          }
        });
      }
      expandButton.addEventListener("click", function () {
        setAll(true);
      });
      collapseButton.addEventListener("click", function () {
        setAll(false);
      });
    }

    applyFilter();
  }

  /* =========================================
     11. Profile page (profile.html)
     ========================================= */

  function buildSummaryList(pairs) {
    const list = document.createElement("dl");
    pairs.forEach(function (pair) {
      if (!pair[1]) {
        return;
      }
      const term = document.createElement("dt");
      term.textContent = pair[0];
      const detail = document.createElement("dd");
      detail.textContent = pair[1];
      list.appendChild(term);
      list.appendChild(detail);
    });
    return list;
  }

  /* Fill the "Your Saved Profile" card from the stored account,
     or explain how to create one. */
  function renderSavedProfile(account) {
    const card = document.getElementById("saved-profile-card");
    if (!card) {
      return;
    }
    card.textContent = "";
    const heading = document.createElement("h3");
    heading.textContent = "Student Summary";
    card.appendChild(heading);
    if (!account) {
      const empty = document.createElement("p");
      empty.textContent = "No profile is saved in this browser yet. " +
        "Create your account below and your details will appear here.";
      card.appendChild(empty);
      return;
    }
    card.appendChild(buildSummaryList([
      ["Student Name", account.firstName + " " + account.lastName],
      ["Student Number", account.studentNumber],
      ["University Email", account.email],
      ["Phone", account.phone],
      ["Program", account.programLabel],
      ["Year of Study", account.yearLabel],
      ["Expected Graduation", account.graduationDate],
      ["Registered Credit Hours", account.registeredCredits],
      ["Default Target Course Grade", account.targetGrade + "%"],
      ["Preferred GPA Scale", account.gpaScale + " scale"],
      ["Reminders", account.reminders && account.reminders.length > 0 ? account.reminders.join(", ") : ""],
      ["Academic Goals", account.goals]
    ]));
    const note = document.createElement("p");
    note.textContent = "Stored in this browser only. Your password is kept as a " +
      "one-way SHA-256 hash, never as plain text.";
    card.appendChild(note);
  }

  /* Toggle between the sign-in form and the signed-in status line,
     based on whether a valid session exists. */
  function refreshSessionUi() {
    const signInForm = document.getElementById("sign-in-form");
    const statusBox = document.getElementById("session-status");
    const signOutBlock = document.getElementById("sign-out-block");
    if (!signInForm || !statusBox || !signOutBlock) {
      return;
    }
    const account = Data.loadAccount();
    const session = Data.loadSession();
    const signedIn = Boolean(account && session &&
      session.email.toLowerCase() === account.email.toLowerCase());
    signInForm.hidden = signedIn;
    statusBox.hidden = !signedIn;
    signOutBlock.hidden = !signedIn;
    if (signedIn) {
      statusBox.textContent = "Signed in as " + account.firstName + " " +
        account.lastName + " (" + account.email + ") on this device.";
    }
  }

  function initProfilePage() {
    renderSavedProfile(Data.loadAccount());

    const signInForm = document.getElementById("sign-in-form");
    if (signInForm) {
      /* Signed-in status line and sign-out control (JavaScript-only UI). */
      const statusBox = document.createElement("p");
      statusBox.id = "session-status";
      statusBox.className = "feedback feedback--success";
      statusBox.setAttribute("role", "status");
      statusBox.hidden = true;
      const signOutBlock = document.createElement("p");
      signOutBlock.id = "sign-out-block";
      signOutBlock.hidden = true;
      const signOutButton = document.createElement("button");
      signOutButton.type = "button";
      signOutButton.className = "button-quiet";
      signOutButton.textContent = "Sign out";
      signOutBlock.appendChild(signOutButton);
      signInForm.insertAdjacentElement("beforebegin", statusBox);
      statusBox.insertAdjacentElement("afterend", signOutBlock);

      signOutButton.addEventListener("click", function () {
        Data.clearSession();
        refreshSessionUi();
        showFeedback(signInForm, "info",
          "Signed out. Your profile is still saved on this device.");
      });

      attachLiveErrorClearing(signInForm);
      signInForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const valid = validateFields(signInForm, [
          {
            id: "signin-email",
            required: "Enter your university email.",
            pattern: EMAIL_PATTERN,
            patternMsg: "Enter a valid email address, like name@my.yorku.ca."
          },
          {
            id: "signin-password",
            required: "Enter your password.",
            minLength: [8, "Passwords are at least 8 characters."]
          }
        ]);
        if (!valid) {
          return;
        }
        const account = Data.loadAccount();
        const emailInput = document.getElementById("signin-email");
        const passwordInput = document.getElementById("signin-password");
        if (!account) {
          showFeedback(signInForm, "error",
            "No account exists on this device yet. Create your account below - it only takes a minute.");
          return;
        }
        if (emailInput.value.trim().toLowerCase() !== account.email.toLowerCase()) {
          setFieldError(emailInput, "No account with this email exists on this device.");
          showFeedback(signInForm, "error", "Please fix the highlighted fields and try again.");
          emailInput.focus();
          return;
        }
        /* Compare one-way hashes - the stored password is never readable. */
        Data.hashPassword(passwordInput.value).then(function (hash) {
          if (hash !== account.passwordHash) {
            setFieldError(passwordInput, "Incorrect password. Please try again.");
            showFeedback(signInForm, "error", "Please fix the highlighted fields and try again.");
            passwordInput.focus();
            return;
          }
          const remember = document.getElementById("remember-me").checked;
          Data.saveSession(account.email, remember);
          signInForm.reset();
          clearFeedback(signInForm);
          refreshSessionUi();
          statusBox.textContent = "Welcome back, " + account.firstName +
            "! You are signed in as " + account.email +
            (remember ? " and will stay signed in on this device." : " for this browser tab.");
        });
      });

      refreshSessionUi();
    }

    const accountForm = document.getElementById("create-account-form");
    if (!accountForm) {
      return;
    }
    attachLiveErrorClearing(accountForm);
    accountForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const valid = validateFields(accountForm, [
        { id: "first-name", required: "Enter your first name." },
        { id: "last-name", required: "Enter your last name." },
        {
          id: "student-number",
          required: "Enter your student number.",
          pattern: /^\d{9}$/,
          patternMsg: "Student numbers are exactly 9 digits."
        },
        {
          id: "account-email",
          required: "Enter your university email.",
          pattern: EMAIL_PATTERN,
          patternMsg: "Enter a valid email address, like name@my.yorku.ca."
        },
        { id: "phone-number", custom: phoneMessage },
        { id: "program-name", required: "Select your program." },
        { radio: "year-of-study", required: "Choose your year of study." },
        {
          id: "graduation-date",
          custom: function (value) {
            const chosen = new Date(value + "T00:00:00");
            return chosen.getTime() <= Date.now()
              ? "Choose a graduation date in the future."
              : null;
          }
        },
        {
          id: "registered-credits",
          number: { min: 0, max: 60, msg: "Registered credits must be between 0 and 60." }
        },
        {
          id: "target-course-grade",
          required: "Enter your default target grade.",
          number: { min: 50, max: 100, msg: "Target grade must be between 50 and 100." }
        },
        {
          id: "new-password",
          required: "Create a password.",
          minLength: [8, "Use at least 8 characters."],
          custom: function (value) {
            return /[A-Za-z]/.test(value) && /\d/.test(value)
              ? null
              : "Use at least one letter and one number.";
          }
        },
        {
          id: "confirm-password",
          required: "Re-enter your password.",
          match: ["new-password", "Passwords do not match."]
        },
        { id: "storage-consent", required: "Please confirm how your profile is stored." }
      ]);
      if (!valid) {
        return;
      }

      const programSelect = document.getElementById("program-name");
      const yearChoice = accountForm.querySelector("input[name='year-of-study']:checked");
      const account = {
        firstName: document.getElementById("first-name").value.trim(),
        lastName: document.getElementById("last-name").value.trim(),
        studentNumber: document.getElementById("student-number").value.trim(),
        email: document.getElementById("account-email").value.trim(),
        phone: document.getElementById("phone-number").value.trim(),
        programLabel: programSelect.selectedOptions[0].textContent,
        yearLabel: yearChoice ? qs("label[for='" + yearChoice.id + "']").textContent : "",
        graduationDate: document.getElementById("graduation-date").value,
        registeredCredits: document.getElementById("registered-credits").value,
        targetGrade: document.getElementById("target-course-grade").value,
        gpaScale: document.getElementById("preferred-gpa-scale").value,
        reminders: qsa("input[name='reminder-preference']:checked", accountForm).map(function (box) {
          return qs("label[for='" + box.id + "']").textContent;
        }),
        goals: document.getElementById("academic-goals").value.trim(),
        createdAt: new Date().toISOString()
      };

      /* Hash the password, then persist the account and sign the user in. */
      Data.hashPassword(document.getElementById("new-password").value).then(function (hash) {
        account.passwordHash = hash;
        const existed = Data.loadAccount() !== null;
        const saved = Data.saveAccount(account);
        Data.saveSession(account.email, true);
        renderSavedProfile(account);
        refreshSessionUi();

        const section = accountForm.closest("section");
        let summary = document.getElementById("account-summary");
        if (summary) {
          summary.remove();
        }
        summary = document.createElement("article");
        summary.id = "account-summary";
        const heading = document.createElement("h3");
        heading.textContent = "Profile saved to this browser";
        summary.appendChild(heading);
        summary.appendChild(buildSummaryList([
          ["Name", account.firstName + " " + account.lastName],
          ["Student Number", account.studentNumber],
          ["University Email", account.email],
          ["Program", account.programLabel],
          ["Year of Study", account.yearLabel],
          ["Default Target Grade", account.targetGrade + "%"],
          ["Preferred GPA Scale", account.gpaScale + " scale"]
        ]));
        const note = document.createElement("p");
        note.textContent = "You are signed in automatically. The password is stored only as a one-way hash.";
        summary.appendChild(note);
        section.appendChild(summary);

        accountForm.reset();
        let message = "Account created for " + account.firstName + " " + account.lastName +
          " - you are now signed in on this device.";
        if (existed) {
          message += " Your previous saved profile was replaced.";
        }
        if (!saved) {
          message += " Note: your browser blocked local storage, so the profile lasts for this visit only.";
        }
        showFeedback(accountForm, "success", message);
        scrollToElement(summary);
      });
    });
  }

  /* =========================================
     12. Contact page (contact.html)
     ========================================= */

  function initContactPage() {
    const form = document.getElementById("contact-form");
    if (!form) {
      return;
    }
    attachLiveErrorClearing(form);

    /* Live character counter under the message box. */
    const messageBox = document.getElementById("message-body");
    const counter = document.createElement("span");
    counter.id = "message-count";
    counter.className = "char-counter";
    messageBox.insertAdjacentElement("afterend", counter);
    const MIN_MESSAGE = 20;

    function updateCounter() {
      const length = messageBox.value.trim().length;
      if (length === 0) {
        counter.textContent = "Your message needs at least " + MIN_MESSAGE + " characters.";
        counter.classList.add("is-short");
      } else if (length < MIN_MESSAGE) {
        counter.textContent = length + " characters - add at least " + (MIN_MESSAGE - length) + " more.";
        counter.classList.add("is-short");
      } else {
        counter.textContent = length + " characters - thank you for the detail!";
        counter.classList.remove("is-short");
      }
    }
    messageBox.addEventListener("input", updateCounter);
    updateCounter();

    /* Conditional rule: a phone number becomes required as soon as
       the user asks for a reply by phone. */
    const phoneInput = document.getElementById("contact-phone");
    const replyPhone = document.getElementById("reply-phone");
    replyPhone.addEventListener("change", function () {
      if (replyPhone.checked && phoneInput.value.trim() === "") {
        setFieldError(phoneInput, "Add a phone number so we can reply by phone.");
      } else {
        clearFieldError(phoneInput);
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const valid = validateFields(form, [
        { id: "contact-name", required: "Enter your full name." },
        {
          id: "contact-email",
          required: "Enter your email address.",
          pattern: EMAIL_PATTERN,
          patternMsg: "Enter a valid email address, like name@my.yorku.ca."
        },
        {
          id: "contact-phone",
          custom: function (value, currentForm) {
            if (value === "") {
              return null;
            }
            return phoneMessage(value);
          },
          required: replyPhone.checked ? "Add a phone number so we can reply by phone." : undefined
        },
        { id: "student-role", required: "Select the option that describes you." },
        { id: "message-topic", required: "Choose a topic for your message." },
        { radio: "urgency-level", required: "Choose an urgency level." },
        {
          id: "reply-date",
          custom: function (value) {
            const chosen = new Date(value + "T23:59:59");
            return chosen.getTime() < Date.now()
              ? "Choose today or a future date."
              : null;
          }
        },
        {
          id: "message-subject",
          required: "Enter a subject.",
          minLength: [3, "The subject needs at least 3 characters."]
        },
        {
          id: "message-body",
          required: "Enter your message.",
          minLength: [MIN_MESSAGE, "Messages need at least " + MIN_MESSAGE + " characters so we can help properly."]
        },
        { id: "contact-consent", required: "Please confirm you understand how this form works." }
      ]);
      if (!valid) {
        return;
      }

      const name = document.getElementById("contact-name").value.trim();
      const subject = document.getElementById("message-subject").value.trim();
      const topicSelect = document.getElementById("message-topic");
      const pageSelect = document.getElementById("related-page");
      const urgency = form.querySelector("input[name='urgency-level']:checked");
      const replyMethods = qsa("input[name='reply-method']:checked", form).map(function (box) {
        return qs("label[for='" + box.id + "']").textContent;
      });

      const pairs = [
        ["Subject", subject],
        ["Topic", topicSelect.selectedOptions[0].textContent],
        ["Related Page", pageSelect.selectedOptions[0].textContent],
        ["Urgency", urgency ? qs("label[for='" + urgency.id + "']").textContent : ""],
        ["Preferred Reply Date", document.getElementById("reply-date").value || "No preference"],
        ["Reply Preferences", replyMethods.length > 0 ? replyMethods.join(", ") : "Not specified"]
      ];

      const section = form.closest("section");
      let summary = document.getElementById("message-summary");
      if (summary) {
        summary.remove();
      }
      summary = document.createElement("article");
      summary.id = "message-summary";
      const heading = document.createElement("h3");
      heading.textContent = "Message recorded";
      summary.appendChild(heading);
      summary.appendChild(buildSummaryList(pairs));
      section.appendChild(summary);

      form.reset();
      updateCounter();
      showFeedback(form, "success",
        "Thanks, " + name + "! Your message passed every check and was recorded in this browser. " +
        "This course project does not send messages to a server.");
      scrollToElement(summary);
    });

    qs("button[type='reset']", form).addEventListener("click", function () {
      clearAllFieldErrors(form);
      clearFeedback(form);
      window.setTimeout(updateCounter, 0);
    });
  }

  /* =========================================
     13. Boot: run the initialiser for this page
     ========================================= */

  document.addEventListener("DOMContentLoaded", function () {
    if (!Data) {
      return;
    }
    const body = document.body;
    const courses = Data.loadCourses();

    if (body.classList.contains("page-index")) {
      initDashboardPage(courses);
    } else if (body.classList.contains("page-courses")) {
      initCoursesPage(courses);
    } else if (body.classList.contains("page-course-detail")) {
      initCourseDetailPage(courses);
    } else if (body.classList.contains("page-gpa-calculator")) {
      initGpaCalculatorPage();
    } else if (body.classList.contains("page-gpa-overview")) {
      initGpaOverviewPage();
    } else if (body.classList.contains("page-faq")) {
      initFaqPage();
    } else if (body.classList.contains("page-profile")) {
      initProfilePage();
    } else if (body.classList.contains("page-contact")) {
      initContactPage();
    }
  });
})();
