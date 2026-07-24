# GradeGuard

**Track Your Grades. Plan Your Success.**

## Course
DIGT 1302 — Web Development Basics, Summer 2026
Phase 3: Dynamic Behavior and Functionality

## Team Members
- Jeffray Zhang, 221999826, jeffray8@my.yorku.ca
- Arya Holmukhe, 222129282, aryaholm@my.yorku.ca
- Alia Hagi-Dhaffe, 221264890, aliahd@my.yorku.ca
- Steven Passynkov, 221955471, stevenp7@my.yorku.ca

## Project Description
GradeGuard is a client-side web application designed to help university students take control of their academic performance. Students can add courses and assignments, see their weighted course grades and status update instantly, simulate "what-if" scenarios to determine the scores needed on future assessments, and calculate their weighted GPA. All data is validated in the browser and saved locally with localStorage — no server required.

## GitHub Repository Link
[GradeGuard Repository](https://github.com/Aryaholmukhe/DIGT-1302)

## GitHub Pages Link
[GradeGuard Live Site](https://aryaholmukhe.github.io/DIGT-1302/)

## Pages Included (9 pages)
1. `index.html` — Dashboard with live academic summary, course status cards, and quick tools
2. `about.html` — About page with mission, team information, and how to use GradeGuard
3. `contact.html` — Contact form with full JavaScript validation and confirmation summary
4. `courses.html` — Course management page with live search, add/remove courses, and localStorage persistence
5. `course-detail.html` — Collapsible per-course panels with assignment tables, add/remove assignments, and a live What-If Calculator
6. `gpa-overview.html` — GPA conversion chart with an interactive percentage lookup
7. `gpa-calculator.html` — Manual GPA calculator with validation, extra course rows, and a generated results table
8. `profile.html` — Sign-in and create-account forms with comprehensive validation
9. `faq.html` — FAQ with live search, topic filtering, and expand/collapse controls

## Phase 1 — Content Structure
- Nine semantic HTML pages (header, nav, main, section, article, aside, footer) with a consistent structure
- Meaningful content for a student grade-tracking application: dashboard summary, course lists, assignment tables, GPA explanations, FAQ, and contact/profile forms
- Accessible forms with labels, fieldsets, and legends; tables with captions and scoped headers; skip-friendly heading hierarchy

## Phase 2 — Styling and Responsive Design
- One shared base stylesheet (`css/style.css`) plus one small stylesheet per page in `css/`
- Consistent academic dashboard identity: navy/teal palette, card-based layout, shared accent-border utility classes to avoid repeated CSS
- Responsive layouts with flexbox, CSS grid, relative units, and media queries for desktop, tablet, and mobile
- Mobile-friendly tables: rows stack into labelled cards on small screens so wide tables fit phones
- Collapsible course panels on the Course Details page so only the selected course shows its details
- Hover states, keyboard focus states, and reduced-motion support
- Refined during Phase 3 into a token-driven theme: one brand accent (teal) with green/yellow/red reserved for grade status, a single brand gradient, a 0.25rem spacing grid (`--space-*`), a six-step type scale, two elevation levels, and two corner radii applied consistently across every page
- Editorial polish: self-hosted Manrope variable font, display-scale headings with tight letter-spacing, small uppercase monospace "kicker" labels introducing each section, a ~70-character reading measure on paragraphs, generous section whitespace, and hairline divider lists in place of boxed chips

## Phase 3 — JavaScript Functionality
JavaScript lives in the `js/` folder, split into two files with a clear purpose:

- **`js/gradeguard-data.js` (the model):** sample course data, localStorage load/save/reset with corrupt-data recovery, and pure calculation functions — weighted course grade, completed/remaining weight, status thresholds, percentage-to-GPA conversion, weighted GPA, and the What-If formula. Contains no DOM code, so the math can be tested on its own.
- **`js/script.js` (the view/controller):** DOM helpers, a shared feedback-message system, reusable form-validation helpers with inline error messages, renderers that build course rows/cards/panels from data, and one initialiser per page dispatched from the body class on `DOMContentLoaded`.

Highlights:
- **DOM manipulation:** the dashboard metrics, course table, and every course panel on Course Details are built from data with `createElement`/`append` and escaped `innerHTML` templates; content updates use `textContent`, attribute and class changes (progress bars, status colours, `aria-invalid`, `details.open`)
- **Event handling:** `submit`, `click` (with event delegation for dynamically created Remove buttons), `input` (live search, live What-If recalculation, character counter), `change` (topic filter, GPA scale, conditional phone requirement), `keydown` (Escape clears search), `mouseover`/`mouseout` (GPA chart row preview), and `DOMContentLoaded`
- **Form validation:** every form validates on the client with inline error messages next to each field, `aria-invalid` styling, focus on the first invalid field, and a form-level summary; rules include required fields, email format, 9-digit student number, phone digits, password strength and confirmation match, number ranges, future-date checks, minimum message length, and duplicate-course detection
- **Interactive functionality:** add/remove courses and assignments with instant grade/status/GPA recalculation, live What-If Calculator per course, GPA calculator with a generated results table and academic standing, FAQ live search + filtering, GPA chart lookup with row highlighting, and course search
- **User feedback:** success/error/warning/info message boxes, confirmation summaries after sign-up and contact submissions, live counters and status lines (`role="status"`/`role="alert"` for screen readers), and graceful handling of invalid input, duplicate data, empty states, and blocked localStorage
- **Optional features used:** localStorage persistence, data loaded from a local JSON-style structure, smooth scrolling that respects `prefers-reduced-motion`

## Validation and Testing
- HTML checked with the [W3C Markup Validation Service](https://validator.w3.org/)
- CSS checked with the [W3C CSS Validator](https://jigsaw.w3.org/css-validator/)
- JavaScript tested with valid and invalid input on every form, the browser console kept free of errors, and the layout re-checked on desktop, tablet, and mobile widths after dynamic content is added

## Technologies
- Semantic HTML5, CSS3, and vanilla JavaScript (ES6)
- No external frameworks or libraries

## Credits
- All main written content: Work by the GradeGuard team (Group 8)
- Profile image on `profile.html`: [iStock user profile avatar illustration](https://www.istockphoto.com/vector/vector-flat-illustration-in-grayscale-avatar-user-profile-person-icon-gender-gm2151669184-572745045?searchscope=image%2Cfilm)
- [Manrope](https://fonts.google.com/specimen/Manrope) typeface by Mikhail Sharanda, self-hosted in `fonts/` under the [SIL Open Font License 1.1](https://openfontlicense.org/)
- Built for DIGT 1302 — Web Development Basics at York University, Summer 2026
- Professor May Haidar
