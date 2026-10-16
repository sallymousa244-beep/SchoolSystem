
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";


// =====================================
// المتغيرات الأساسية
// =====================================

const DEFAULT_YEAR = "2026 / 2027";

let currentSchoolId = "";
let currentAcademicYear = DEFAULT_YEAR;

let allStudents = [];
let allRecords = [];

let isSaving = false;
let isLoading = false;


// =====================================
// عناصر نموذج تسجيل الغياب
// =====================================

const gradeSelect = document.getElementById("gradeSelect");
const lessonSelect = document.getElementById("lessonSelect");
const attendanceDate = document.getElementById("attendanceDate");
const teacherName = document.getElementById("teacherName");
const studentSelect = document.getElementById("studentSelect");

const studentStatusPreview =
  document.getElementById("studentStatusPreview");

const saveAttendanceBtn =
  document.getElementById("saveAttendanceBtn");

const refreshListBtn =
  document.getElementById("refreshListBtn");

const pageMessage =
  document.getElementById("pageMessage");

const todayDate =
  document.getElementById("todayDate");


// =====================================
// عناصر تصفية جدول حالة الطلبة
// =====================================

const statusGradeFilter =
  document.getElementById("statusGradeFilter");

const statusLessonFilter =
  document.getElementById("statusLessonFilter");

const studentsBody =
  document.getElementById("studentsBody");


// =====================================
// عناصر تصفية سجل الغياب والمغادرات
// =====================================

const filterGrade =
  document.getElementById("filterGrade");

const filterLesson =
  document.getElementById("filterLesson");

const filterDate =
  document.getElementById("filterDate");

const filterStatus =
  document.getElementById("filterStatus");

const filterTeacher =
  document.getElementById("filterTeacher");

const filterStudent =
  document.getElementById("filterStudent");

const applyFiltersBtn =
  document.getElementById("applyFiltersBtn");

const clearFiltersBtn =
  document.getElementById("clearFiltersBtn");

const absenceRecordsBody =
  document.getElementById("absenceRecordsBody");

const recordsCount =
  document.getElementById("recordsCount");


// =====================================
// التاريخ والوقت
// =====================================

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getLocalTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}


function formatDate(dateString) {
  if (!dateString) return "—";

  const parts = dateString.split("-");

  if (parts.length !== 3) return dateString;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}


function getRecordTime(record) {
  if (record.time) return record.time;

  if (record.departureTime) return record.departureTime;

  if (record.createdAt?.toDate) {
    return record.createdAt.toDate().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  return "—";
}


// =====================================
// رسائل الصفحة
// =====================================

function showMessage(message, type = "info") {
  if (!pageMessage) return;

  pageMessage.textContent = message;
  pageMessage.className = `attendance-message ${type}`;
}


function clearMessage() {
  if (!pageMessage) return;

  pageMessage.textContent = "";
  pageMessage.className = "attendance-message";
}


// =====================================
// حماية النصوص المعروضة
// =====================================

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// =====================================
// قراءة بيانات الطلبة من Firebase
// =====================================

async function loadStudents() {
  const studentsRef = collection(
    db,
    "schools",
    currentSchoolId,
    "students"
  );

  const snapshot = await getDocs(studentsRef);

  allStudents = snapshot.docs
    .map(item => ({
      id: item.id,
      ...item.data()
    }))
    .filter(student => {
      const year = student.academicYear || DEFAULT_YEAR;

      return (
        student.isActive !== false &&
        year === currentAcademicYear &&
        student.name &&
        student.grade
      );
    })
    .sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "ar")
    );
}


// =====================================
// قراءة سجلات الغياب والمغادرات
// =====================================

async function loadRecords() {
  const recordsRef = collection(
    db,
    "schools",
    currentSchoolId,
    "records"
  );

  const snapshot = await getDocs(recordsRef);

  allRecords = snapshot.docs
    .map(item => ({
      id: item.id,
      ...item.data()
    }))
    .filter(record => {
      const year = record.academicYear || DEFAULT_YEAR;

      return (
        year === currentAcademicYear &&
        ["absence", "departure"].includes(record.type)
      );
    });
}


// =====================================
// تحميل بيانات المدرسة
// =====================================

async function loadSchool(user) {
  currentSchoolId = user.uid;

  const schoolRef = doc(
    db,
    "schools",
    currentSchoolId
  );

  const schoolSnapshot = await getDoc(schoolRef);

  if (!schoolSnapshot.exists()) {
    throw new Error("لم يتم العثور على بيانات المدرسة.");
  }

  const school = schoolSnapshot.data();

  if (school.ownerUid !== user.uid) {
    throw new Error("لا توجد صلاحية للوصول إلى بيانات هذه المدرسة.");
  }

  currentAcademicYear =
    school.currentAcademicYear || DEFAULT_YEAR;

  const schoolNameElement =
    document.getElementById("sidebarSchoolName");

  if (schoolNameElement) {
    schoolNameElement.textContent =
      school.schoolName || "المدرسة";
  }

  const savedTeacher =
    localStorage.getItem("attendanceTeacherName");

  if (!teacherName.value.trim()) {
    teacherName.value =
      savedTeacher || user.displayName || "";
  }

  await loadStudents();
  await loadRecords();

  populateGradeOptions();
  populateStatusGradeOptions();
  populateFilterGradeOptions();

  renderStudents();
  renderStudentStatus();
  renderRecords();

  showMessage(
    `تم تحميل بيانات العام الدراسي ${currentAcademicYear}.`,
    "success"
  );
}


// =====================================
// الصفوف والشعب المتوفرة
// =====================================

function getGrades() {
  return [...new Set(
    allStudents
      .map(student => student.grade)
      .filter(Boolean)
  )].sort((a, b) =>
    a.localeCompare(b, "ar")
  );
}


// =====================================
// قائمة الصف في نموذج تسجيل الغياب
// =====================================

function populateGradeOptions() {
  const selectedValue = gradeSelect.value;

  gradeSelect.innerHTML =
    '<option value="">اختر الصف والشعبة</option>';

  getGrades().forEach(grade => {
    const option = document.createElement("option");

    option.value = grade;
    option.textContent = grade;

    gradeSelect.appendChild(option);
  });

  if (getGrades().includes(selectedValue)) {
    gradeSelect.value = selectedValue;
  }

  updateStudentOptions();
}


// =====================================
// قائمة الصف المستقلة لجدول حالة الطلبة
// =====================================

function populateStatusGradeOptions() {
  const selectedValue = statusGradeFilter.value;

  statusGradeFilter.innerHTML =
    '<option value="">اختر الصف والشعبة</option>';

  getGrades().forEach(grade => {
    const option = document.createElement("option");

    option.value = grade;
    option.textContent = grade;

    statusGradeFilter.appendChild(option);
  });

  if (getGrades().includes(selectedValue)) {
    statusGradeFilter.value = selectedValue;
  }
}


// =====================================
// قائمة الصف في سجل الغياب والمغادرات
// =====================================

function populateFilterGradeOptions() {
  const selectedValue = filterGrade.value;

  filterGrade.innerHTML =
    '<option value="">جميع الصفوف والشعب</option>';

  getGrades().forEach(grade => {
    const option = document.createElement("option");

    option.value = grade;
    option.textContent = grade;

    filterGrade.appendChild(option);
  });

  if (getGrades().includes(selectedValue)) {
    filterGrade.value = selectedValue;
  }
}


// =====================================
// الطلبة في الصف المختار بنموذج التسجيل
// =====================================

function getStudentsInSelectedGrade() {
  const grade = gradeSelect.value;

  if (!grade) return [];

  return allStudents.filter(student =>
    student.grade === grade
  );
}


function updateStudentOptions() {
  const previousStudentId = studentSelect.value;

  studentSelect.innerHTML =
    '<option value="">اختر الطالب</option>';

  const students = getStudentsInSelectedGrade();

  students.forEach(student => {
    const option = document.createElement("option");

    option.value = student.id;
    option.textContent = student.name;

    studentSelect.appendChild(option);
  });

  studentSelect.disabled = students.length === 0;

  if (students.some(student => student.id === previousStudentId)) {
    studentSelect.value = previousStudentId;
  }

  if (!gradeSelect.value) {
    studentSelect.innerHTML =
      '<option value="">اختر الصف والشعبة أولًا</option>';

    studentSelect.disabled = true;
  } else if (students.length === 0) {
    studentSelect.innerHTML =
      '<option value="">لا يوجد طلبة في هذا الصف</option>';
  }

  renderStudentStatus();
}


// =====================================
// توحيد قراءة حقول السجلات
// =====================================

function getRecordGrade(record) {
  return record.grade || record.className || record.class || "";
}


function getRecordStudentName(record) {
  return (
    record.studentName ||
    record.name ||
    record.student ||
    "—"
  );
}


function getRecordDate(record) {
  return record.date || "";
}


function sameStudent(record, student) {
  if (record.studentId && student.id) {
    return record.studentId === student.id;
  }

  return (
    getRecordStudentName(record) === student.name &&
    getRecordGrade(record) === student.grade
  );
}


// =====================================
// حالة الطالب في التاريخ والحصة المحددين
// =====================================

function getRecordStatusForStudent(student, date, lesson) {
  const matchingRecords = allRecords.filter(record =>
    sameStudent(record, student) &&
    getRecordDate(record) === date
  );

  const departure = matchingRecords.find(record =>
    record.type === "departure"
  );

  if (departure) {
    return {
      text: "مغادر",
      css: "status-departure",
      record: departure
    };
  }

  const absence = matchingRecords.find(record =>
    record.type === "absence" &&
    record.lesson === lesson
  );

  if (absence) {
    return {
      text: "غائب",
      css: "status-absence",
      record: absence
    };
  }

  return {
    text: "لم يسجل الغياب",
    css: "status-pending",
    record: null
  };
}


// =====================================
// عرض حالة الطلبة وفق التصفية المستقلة
// =====================================

function renderStudents() {
  const grade = statusGradeFilter.value;
  const lesson = statusLessonFilter.value;
  const date = attendanceDate.value;

  studentsBody.innerHTML = "";

  if (!grade || !lesson || !date) {
    studentsBody.innerHTML = `
      <tr>
        <td colspan="6">
          اختر الصف والحصة لعرض حالة الطلبة.
        </td>
      </tr>
    `;

    return;
  }

  const students = allStudents.filter(student =>
    student.grade === grade
  );

  if (students.length === 0) {
    studentsBody.innerHTML = `
      <tr>
        <td colspan="6">لا يوجد طلبة مسجلون في الصف المحدد.</td>
      </tr>
    `;

    return;
  }

  students.forEach(student => {
    const status = getRecordStatusForStudent(
      student,
      date,
      lesson
    );

    const record = status.record;

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHTML(student.name)}</td>
      <td>${escapeHTML(student.grade)}</td>
      <td>${escapeHTML(lesson)}</td>
      <td>
        <span class="attendance-status ${status.css}">
          ${escapeHTML(status.text)}
        </span>
      </td>
      <td>${escapeHTML(record?.teacher || "—")}</td>
      <td>${escapeHTML(record ? getRecordTime(record) : "—")}</td>
    `;

    studentsBody.appendChild(row);
  });
}


// =====================================
// معاينة حالة الطالب في نموذج التسجيل
// =====================================

function renderStudentStatus() {
  const studentId = studentSelect.value;

  if (!studentId) {
    studentStatusPreview.textContent =
      "اختر طالبًا لعرض حالته.";

    return;
  }

  const student = allStudents.find(item =>
    item.id === studentId
  );

  if (!student) {
    studentStatusPreview.textContent =
      "لم يتم العثور على بيانات الطالب.";

    return;
  }

  const lesson = lessonSelect.value;
  const date = attendanceDate.value;

  if (!lesson || !date) {
    studentStatusPreview.textContent =
      "اختر الحصة والتاريخ لعرض الحالة.";

    return;
  }

  const status = getRecordStatusForStudent(
    student,
    date,
    lesson
  );

  studentStatusPreview.textContent = status.text;
}


// =====================================
// تسجيل الغياب
// =====================================

async function saveAttendance() {
  if (isSaving) return;

  const grade = gradeSelect.value;
  const lesson = lessonSelect.value;
  const date = attendanceDate.value;
  const studentId = studentSelect.value;
  const teacher = teacherName.value.trim();

  if (!grade) {
    showMessage("يرجى اختيار الصف والشعبة.", "error");
    return;
  }

  if (!lesson) {
    showMessage("يرجى اختيار الحصة.", "error");
    return;
  }

  if (!date) {
    showMessage("يرجى تحديد التاريخ.", "error");
    return;
  }

  if (!studentId) {
    showMessage("يرجى اختيار الطالب.", "error");
    return;
  }

  if (!teacher) {
    showMessage("يرجى كتابة اسم المعلم أو المعلمة.", "error");
    teacherName.focus();
    return;
  }

  const student = allStudents.find(item =>
    item.id === studentId
  );

  if (!student || student.grade !== grade) {
    showMessage(
      "تعذر العثور على الطالب ضمن الصف المحدد.",
      "error"
    );

    return;
  }

  const status = getRecordStatusForStudent(
    student,
    date,
    lesson
  );

  if (status.text === "مغادر") {
    showMessage(
      "يوجد سجل مغادرة لهذا الطالب في التاريخ المحدد، ولم يُسجل الغياب.",
      "error"
    );

    return;
  }

  if (status.text === "غائب") {
    showMessage(
      "تم تسجيل غياب هذا الطالب في الحصة والتاريخ المحددين مسبقًا.",
      "error"
    );

    return;
  }

  isSaving = true;
  saveAttendanceBtn.disabled = true;

  try {
    localStorage.setItem(
      "attendanceTeacherName",
      teacher
    );

    const recordsRef = collection(
      db,
      "schools",
      currentSchoolId,
      "records"
    );

    await addDoc(recordsRef, {
      type: "absence",
      studentId: student.id,
      studentName: student.name,
      grade: student.grade,
      lesson,
      date,
      time: getLocalTime(),
      teacher,
      academicYear: currentAcademicYear,
      createdAt: serverTimestamp()
    });

    await loadRecords();

    renderStudents();
    renderStudentStatus();
    renderRecords();

    showMessage(
      `تم تسجيل غياب الطالب ${student.name} بنجاح.`,
      "success"
    );

  } catch (error) {
    console.error("Attendance save error:", error);

    showMessage(
      "تعذر حفظ الغياب. تحقق من الاتصال بالإنترنت وصلاحيات Firebase.",
      "error"
    );

  } finally {
    isSaving = false;
    saveAttendanceBtn.disabled = false;
  }
}


// =====================================
// عرض سجل الغياب والمغادرات
// =====================================

function renderRecords() {
  const grade = filterGrade.value;
  const lesson = filterLesson.value;
  const date = filterDate.value;
  const status = filterStatus.value;

  const teacherQuery = filterTeacher.value
    .trim()
    .toLocaleLowerCase("ar");

  const studentQuery = filterStudent.value
    .trim()
    .toLocaleLowerCase("ar");

  const filteredRecords = allRecords
    .filter(record => {
      if (grade && getRecordGrade(record) !== grade) {
        return false;
      }

      if (lesson && record.lesson !== lesson) {
        return false;
      }

      if (date && getRecordDate(record) !== date) {
        return false;
      }

      if (status && record.type !== status) {
        return false;
      }

      const teacher = String(record.teacher || "")
        .toLocaleLowerCase("ar");

      if (teacherQuery && !teacher.includes(teacherQuery)) {
        return false;
      }

      const studentName = getRecordStudentName(record)
        .toLocaleLowerCase("ar");

      if (studentQuery && !studentName.includes(studentQuery)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const dateCompare = getRecordDate(b).localeCompare(
        getRecordDate(a)
      );

      if (dateCompare !== 0) return dateCompare;

      return getRecordTime(b).localeCompare(getRecordTime(a));
    });

  absenceRecordsBody.innerHTML = "";

  if (filteredRecords.length === 0) {
    absenceRecordsBody.innerHTML = `
      <tr>
        <td colspan="7">
          لا توجد سجلات مطابقة لخيارات التصفية.
        </td>
      </tr>
    `;
  } else {
    filteredRecords.forEach(record => {
      const isDeparture = record.type === "departure";

      const statusText = isDeparture
        ? "مغادر"
        : "غائب";

      const statusClass = isDeparture
        ? "status-departure"
        : "status-absence";

      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${escapeHTML(getRecordStudentName(record))}</td>
        <td>${escapeHTML(getRecordGrade(record) || "—")}</td>
        <td>${escapeHTML(record.lesson || "—")}</td>
        <td>
          <span class="attendance-status ${statusClass}">
            ${statusText}
          </span>
        </td>
        <td>${escapeHTML(record.teacher || "—")}</td>
        <td>${escapeHTML(formatDate(getRecordDate(record)))}</td>
        <td>${escapeHTML(getRecordTime(record))}</td>
      `;

      absenceRecordsBody.appendChild(row);
    });
  }

  recordsCount.textContent = String(filteredRecords.length);
}


// =====================================
// تحديث البيانات
// =====================================

async function refreshData() {
  if (isLoading) return;

  isLoading = true;
  refreshListBtn.disabled = true;

  try {
    await loadStudents();
    await loadRecords();

    populateGradeOptions();
    populateStatusGradeOptions();
    populateFilterGradeOptions();

    renderStudents();
    renderStudentStatus();
    renderRecords();

    showMessage("تم تحديث البيانات بنجاح.", "success");

  } catch (error) {
    console.error("Refresh error:", error);

    showMessage(
      "تعذر تحديث البيانات. تحقق من الاتصال وصلاحيات قاعدة البيانات.",
      "error"
    );

  } finally {
    isLoading = false;
    refreshListBtn.disabled = false;
  }
}


// =====================================
// مسح تصفية سجل الغياب والمغادرات
// =====================================

function clearFilters() {
  filterGrade.value = "";
  filterLesson.value = "";
  filterDate.value = "";
  filterStatus.value = "";
  filterTeacher.value = "";
  filterStudent.value = "";

  renderRecords();
}


// =====================================
// ربط أحداث الصفحة
// =====================================

function initializePage() {
  const today = getLocalDate();

  attendanceDate.value = today;
  todayDate.textContent = formatDate(today);

  // إظهار سجلات جميع التواريخ في سجل الغياب والمغادرات.
  filterDate.value = "";

  // نموذج تسجيل الغياب.
  gradeSelect.addEventListener("change", () => {
    updateStudentOptions();
    renderStudentStatus();
  });

  lessonSelect.addEventListener("change", () => {
    renderStudentStatus();
  });

  attendanceDate.addEventListener("change", () => {
    renderStudents();
    renderStudentStatus();
  });

  studentSelect.addEventListener(
    "change",
    renderStudentStatus
  );

  teacherName.addEventListener("change", () => {
    localStorage.setItem(
      "attendanceTeacherName",
      teacherName.value.trim()
    );
  });

  saveAttendanceBtn.addEventListener(
    "click",
    saveAttendance
  );

  refreshListBtn.addEventListener(
    "click",
    refreshData
  );

  // تصفية مستقلة لجدول حالة الطلبة.
  statusGradeFilter.addEventListener(
    "change",
    renderStudents
  );

  statusLessonFilter.addEventListener(
    "change",
    renderStudents
  );

  // تصفية سجل الغياب والمغادرات.
  applyFiltersBtn.addEventListener(
    "click",
    renderRecords
  );

  clearFiltersBtn.addEventListener(
    "click",
    clearFilters
  );

  [
    filterGrade,
    filterLesson,
    filterDate,
    filterStatus
  ].forEach(element => {
    element.addEventListener(
      "change",
      renderRecords
    );
  });

  filterTeacher.addEventListener(
    "input",
    renderRecords
  );

  filterStudent.addEventListener(
    "input",
    renderRecords
  );

  // تسجيل الخروج.
  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        window.location.href = "login.html";
      } catch (error) {
        console.error("Logout error:", error);

        showMessage("تعذر تسجيل الخروج.", "error");
      }
    });
  }
}


// =====================================
// بدء تشغيل الصفحة
// =====================================

initializePage();

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  showMessage(
    "جارٍ تحميل بيانات المدرسة والطلبة...",
    "info"
  );

  try {
    await loadSchool(user);
  } catch (error) {
    console.error("Page initialization error:", error);

    showMessage(
      error.message || "تعذر تحميل بيانات الصفحة.",
      "error"
    );
  }
});
