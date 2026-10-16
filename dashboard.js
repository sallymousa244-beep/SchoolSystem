
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// ========================================
// المتغيرات الأساسية
// ========================================

const $ = (id) => document.getElementById(id);

const DEFAULT_YEAR = "2026 / 2027";

let currentAcademicYear = DEFAULT_YEAR;
let schoolRecords = [];
let currentSchoolId = null;
let allStudents = [];
let isSaving = false;

// ========================================
// العام الدراسي
// ========================================

function recordYear(record) {
  return record.academicYear || DEFAULT_YEAR;
}

function studentYear(student) {
  return student.academicYear || DEFAULT_YEAR;
}

function getRecordsForYear() {
  return schoolRecords.filter(
    (record) => recordYear(record) === currentAcademicYear
  );
}

// ========================================
// التاريخ والوقت
// ========================================

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function localTimeString() {
  const now = new Date();

  return (
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0")
  );
}

function formatTime(time) {
  if (!time) return "لا يوجد";

  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return time;
  }

  const period = hours >= 12 ? "مساءً" : "صباحًا";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ");
}

function newestFirst(a, b) {
  const aDate = `${a.date || ""} ${a.time || ""}`;
  const bDate = `${b.date || ""} ${b.time || ""}`;

  return bDate.localeCompare(aDate);
}

// ========================================
// اسم المدرسة والعام الدراسي
// ========================================

function updatePrintSchoolNames(schoolName) {
  const name = schoolName || "اسم المدرسة";

  if ($("printLateSchoolName")) {
    $("printLateSchoolName").textContent = name;
  }

  if ($("printDepartureSchoolName")) {
    $("printDepartureSchoolName").textContent = name;
  }
}

function updateAcademicYearDisplay() {
  const yearElement = $("dashboardAcademicYear");

  if (yearElement) {
    yearElement.textContent = currentAcademicYear;
  }
}

// ========================================
// إظهار حقول الشخص الآخر
// ========================================

function toggleOtherPersonFields() {
  const guardianType = $("guardianType");
  const otherPersonFields = $("otherPersonFields");
  const otherPersonName = $("otherPersonName");

  if (!guardianType || !otherPersonFields) return;

  const isOther = guardianType.value === "شخص آخر";

  otherPersonFields.hidden = !isOther;

  if (otherPersonName) {
    otherPersonName.required = isOther;

    if (!isOther) {
      otherPersonName.value = "";
    }
  }
}

$("guardianType")?.addEventListener(
  "change",
  toggleOtherPersonFields
);

toggleOtherPersonFields();

// ========================================
// التنقل بين أقسام لوحة التحكم
// ========================================

const dashboardLayout = document.querySelector(".dashboard-page");

dashboardLayout?.classList.add("sidebar-collapsed");



function showDashboardView(target) {
  const targetView = document.getElementById(`view-${target}`);

  if (!targetView) {
    console.warn(`القسم غير موجود: view-${target}`);
    return;
  }

  document.querySelectorAll(".dashboard-view").forEach((view) => {
    view.hidden = view !== targetView;
  });

  document.querySelectorAll(".menu-item[data-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === target);
  });

  const schoolInfoBanner = document.getElementById("schoolInfoBanner");

  if (schoolInfoBanner) {
    schoolInfoBanner.hidden = target !== "home";
  }
}


document.querySelectorAll(".menu-item[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    showDashboardView(button.dataset.view);
    dashboardLayout?.classList.add("sidebar-collapsed");
  });
});

document.querySelectorAll(".sidebar a").forEach((link) => {
  link.addEventListener("click", () => {
    dashboardLayout?.classList.add("sidebar-collapsed");
  });
});

const params = new URLSearchParams(window.location.search);
const requestedView = params.get("view");

function openRequestedView() {
  if (requestedView) {
    showDashboardView(requestedView);
  }
}

if (document.readyState === "complete") {
  openRequestedView();
} else {
  window.addEventListener("load", openRequestedView, { once: true });
}

// ========================================
// تسجيل الخروج
// ========================================

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("خطأ في تسجيل الخروج:", error);
    alert("تعذر تسجيل الخروج، حاولي مرة أخرى.");
  }
});

// ========================================
// تحميل الطلاب للعام الدراسي المحدد
// ========================================

async function loadDepartureStudents() {
  if (!currentSchoolId) return;

  const gradeSelect = $("departureGrade");
  const studentSelect = $("departureStudentName");

  if (!gradeSelect || !studentSelect) {
    console.warn("لم يتم العثور على حقول الصف أو اسم الطالب.");
    return;
  }

  try {
    const studentsRef = collection(
      db,
      "schools",
      currentSchoolId,
      "students"
    );

    const snapshot = await getDocs(studentsRef);

    allStudents = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    allStudents = allStudents.filter(
      (student) =>
        cleanText(student.name) &&
        cleanText(student.grade) &&
        studentYear(student) === currentAcademicYear &&
        student.isActive !== false
    );

    const grades = [
      ...new Set(
        allStudents.map((student) => cleanText(student.grade))
      )
    ].sort((a, b) => a.localeCompare(b, "ar"));

    const previousGrade = gradeSelect.value;

    gradeSelect.replaceChildren();

    const gradePlaceholder = document.createElement("option");
    gradePlaceholder.value = "";
    gradePlaceholder.textContent = "يرجى اختيار الصف والشعبة";

    gradeSelect.appendChild(gradePlaceholder);

    grades.forEach((grade) => {
      const option = document.createElement("option");
      option.value = grade;
      option.textContent = grade;

      gradeSelect.appendChild(option);
    });

    studentSelect.replaceChildren();

    const studentPlaceholder = document.createElement("option");
    studentPlaceholder.value = "";
    studentPlaceholder.textContent = "يرجى اختيار الصف أولًا";

    studentSelect.appendChild(studentPlaceholder);
    studentSelect.disabled = true;

    if (grades.includes(previousGrade)) {
      gradeSelect.value = previousGrade;
      populateDepartureStudentNames();
    }

    populateDepartureLogGrades();
    populateReportGrades();

    console.log(
      `تم تحميل ${allStudents.length} طالبًا للعام ${currentAcademicYear}.`
    );
  } catch (error) {
    console.error("خطأ في تحميل الطلاب:", error);

    alert(
      "تعذر تحميل الصفوف وأسماء الطلاب. " +
      "تحققي من اتصال Firebase وصلاحيات قاعدة البيانات."
    );
  }
}

// ========================================
// قائمة أسماء الطلاب - التعديل الأساسي
// ========================================

function populateDepartureStudentNames() {
  const gradeSelect = $("departureGrade");
  const studentSelect = $("departureStudentName");

  if (!gradeSelect || !studentSelect) return;

  const selectedGrade = cleanText(gradeSelect.value);

  studentSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";

  if (!selectedGrade) {
    placeholder.textContent = "يرجى اختيار الصف أولًا";
    studentSelect.appendChild(placeholder);
    studentSelect.disabled = true;
    return;
  }

  const students = allStudents
    .filter((student) => cleanText(student.grade) === selectedGrade)
    .sort((a, b) =>
      cleanText(a.name).localeCompare(cleanText(b.name), "ar")
    );

  placeholder.textContent = students.length
    ? "يرجى اختيار الطالب"
    : "لا يوجد طلاب في هذا الصف";

  studentSelect.appendChild(placeholder);

  students.forEach((student) => {
    const option = document.createElement("option");

    // نخزن معرّف الطالب في Firebase بدلًا من الاسم
    option.value = student.id;

    // الاسم الظاهر للمستخدمة يبقى كما هو
    option.textContent = cleanText(student.name);

    studentSelect.appendChild(option);
  });

  studentSelect.disabled = students.length === 0;
}

$("departureGrade")?.addEventListener(
  "change",
  populateDepartureStudentNames
);

// ========================================
// قوائم الصفوف في التقارير
// ========================================

function populateReportGrades() {
  const gradeSelect = $("reportGrade");
  if (!gradeSelect) return;

  const previousGrade = gradeSelect.value;

  const grades = [
    ...new Set(
      allStudents
        .map((student) => cleanText(student.grade))
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, "ar"));

  gradeSelect.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "جميع الصفوف";

  gradeSelect.appendChild(allOption);

  grades.forEach((grade) => {
    const option = document.createElement("option");
    option.value = grade;
    option.textContent = grade;

    gradeSelect.appendChild(option);
  });

  if (grades.includes(previousGrade)) {
    gradeSelect.value = previousGrade;
  }
}

function populateDepartureLogGrades() {
  const gradeSelect = $("departureLogGrade");

  const grades = [
    ...new Set(
      allStudents
        .map((student) => cleanText(student.grade))
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, "ar"));

  if (gradeSelect) {
    const previousGrade = gradeSelect.value;

    gradeSelect.replaceChildren();

    const option = document.createElement("option");
    option.value = "";
    option.textContent = "جميع الصفوف والشعب";

    gradeSelect.appendChild(option);

    grades.forEach((grade) => {
      const gradeOption = document.createElement("option");
      gradeOption.value = grade;
      gradeOption.textContent = grade;

      gradeSelect.appendChild(gradeOption);
    });

    if (grades.includes(previousGrade)) {
      gradeSelect.value = previousGrade;
    }
  }

  populateDepartureLogStudents();
}

function populateDepartureLogStudents() {
  const gradeSelect = $("departureLogGrade");
  const studentSelect = $("departureLogStudent");

  if (!studentSelect) return;

  const selectedGrade = gradeSelect?.value || "";
  const previousStudent = studentSelect.value;

  const students = allStudents
    .filter(
      (student) =>
        !selectedGrade ||
        cleanText(student.grade) === selectedGrade
    )
    .sort((a, b) =>
      cleanText(a.name).localeCompare(cleanText(b.name), "ar")
    );

  const names = [
    ...new Set(students.map((student) => cleanText(student.name)))
  ];

  studentSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "جميع الطلاب";

  studentSelect.appendChild(placeholder);

  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;

    studentSelect.appendChild(option);
  });

  if (names.includes(previousStudent)) {
    studentSelect.value = previousStudent;
  }
}

$("departureLogGrade")?.addEventListener("change", () => {
  populateDepartureLogStudents();
  renderDepartureLog();
});

$("departureLogStudent")?.addEventListener(
  "change",
  renderDepartureLog
);

$("departureLogSearch")?.addEventListener(
  "input",
  renderDepartureLog
);

// ========================================
// لوحة التحكم والإحصائيات
// ========================================

function updateDashboard() {
  const today = localDateString();
  const yearRecords = getRecordsForYear();

  const todayRecords = yearRecords.filter(
    (record) => record.date === today
  );

  const lateRecords = todayRecords.filter(
    (record) => record.type === "late"
  );

  const departureRecords = todayRecords.filter(
    (record) => record.type === "departure"
  );

  if ($("todayDate")) {
    $("todayDate").textContent = today;
  }

  if ($("todayLateCount")) {
    $("todayLateCount").textContent = lateRecords.length;
  }

  if ($("todayDepartureCount")) {
    $("todayDepartureCount").textContent = departureRecords.length;
  }

  const latestLate = [...lateRecords].sort(newestFirst)[0];
  const latestDeparture = [...departureRecords].sort(newestFirst)[0];

  if ($("lastLateTime")) {
    $("lastLateTime").textContent = latestLate
      ? formatTime(latestLate.time)
      : "لا يوجد";
  }

  if ($("lastDepartureTime")) {
    $("lastDepartureTime").textContent = latestDeparture
      ? formatTime(latestDeparture.time)
      : "لا يوجد";
  }

  const recentBody = $("recentRecordsBody");

  if (recentBody) {
    const recent = [...yearRecords]
      .sort(newestFirst)
      .slice(0, 5);

    recentBody.replaceChildren();

    if (!recent.length) {
      addEmptyRow(recentBody, "لا توجد سجلات حاليًا.", 5);
    } else {
      recent.forEach((record) => {
        const row = document.createElement("tr");

        const recordTypeLabels = {
          late: "تأخير",
          departure: "مغادرة",
          absence: "غياب"
        };

        [
          record.studentName || "",
          record.grade || "",
          recordTypeLabels[record.type] || record.type || "",
          record.date || "",
          record.time || ""
        ].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });

        recentBody.appendChild(row);
      });
    }
  }

  renderLog("lateRecordsBody", "late");
  renderDepartureLog();
}

function addEmptyRow(body, message, columnCount) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = columnCount;
  cell.className = "empty-state";
  cell.textContent = message;

  row.appendChild(cell);
  body.appendChild(row);
}

// ========================================
// سجلات التأخير
// ========================================

function renderLog(bodyId, type) {
  const body = $(bodyId);
  if (!body) return;

  const searchText = cleanText(
    $("lateSearch")?.value || ""
  ).toLowerCase();

  const fromDate = $("reportFrom")?.value || "";
  const toDate = $("reportTo")?.value || "";
  const reportType = $("reportType")?.value || "all";
  const reportGrade = $("reportGrade")?.value || "all";

  const records = getRecordsForYear()
    .filter((record) => {
      if (record.type !== type) return false;

      if (reportType !== "all" && record.type !== reportType) {
        return false;
      }

      if (reportGrade !== "all" && record.grade !== reportGrade) {
        return false;
      }

      if (fromDate && record.date < fromDate) return false;
      if (toDate && record.date > toDate) return false;

      if (
        searchText &&
        !cleanText(record.studentName).toLowerCase().includes(searchText)
      ) {
        return false;
      }

      return true;
    })
    .sort(newestFirst);

  body.replaceChildren();

  if (!records.length) {
    addEmptyRow(body, "لا توجد سجلات.", 5);
    return;
  }

  records.forEach((record) => {
    const row = document.createElement("tr");

    [
      record.studentName || "",
      record.grade || "",
      record.date || "",
      record.time || "",
      record.reason || ""
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    body.appendChild(row);
  });
}

$("lateSearch")?.addEventListener("input", () => {
  renderLog("lateRecordsBody", "late");
});

$("reportFrom")?.addEventListener("change", () => {
  renderLog("lateRecordsBody", "late");
});

$("reportTo")?.addEventListener("change", () => {
  renderLog("lateRecordsBody", "late");
});

$("reportType")?.addEventListener("change", () => {
  renderLog("lateRecordsBody", "late");
});

$("reportGrade")?.addEventListener("change", () => {
  renderLog("lateRecordsBody", "late");
});

// ========================================
// سجل المغادرة
// ========================================

function renderDepartureLog() {
  const body = $("departureRecordsBody");
  if (!body) return;

  const selectedGrade = $("departureLogGrade")?.value || "";
  const selectedStudent = $("departureLogStudent")?.value || "";

  const searchText = cleanText(
    $("departureLogSearch")?.value || ""
  ).toLowerCase();

  const records = getRecordsForYear()
    .filter((record) => {
      if (record.type !== "departure") return false;

      if (selectedGrade && record.grade !== selectedGrade) {
        return false;
      }

      if (
        selectedStudent &&
        record.studentName !== selectedStudent
      ) {
        return false;
      }

      if (
        searchText &&
        !cleanText(record.studentName).toLowerCase().includes(searchText)
      ) {
        return false;
      }

      return true;
    })
    .sort(newestFirst);

  body.replaceChildren();

  if (!records.length) {
    addEmptyRow(body, "لا توجد سجلات مغادرة مطابقة.", 7);
  } else {
    records.forEach((record, index) => {
      const row = document.createElement("tr");

      [
        index + 1,
        record.date || "",
        record.time || "",
        record.reason || "",
        record.guardianType || "",
        record.guardianName || "",
        record.otherPersonPhone || ""
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      body.appendChild(row);
    });
  }

  if ($("studentDepartureTotal")) {
    $("studentDepartureTotal").textContent = records.length;
  }

  if ($("selectedDepartureStudent")) {
    $("selectedDepartureStudent").textContent =
      selectedStudent || "جميع الطلاب";
  }

  if ($("printDepartureStudentName")) {
    $("printDepartureStudentName").textContent =
      selectedStudent || "جميع الطلاب";
  }

  if ($("printDepartureStudentGrade")) {
    $("printDepartureStudentGrade").textContent =
      selectedGrade || "جميع الصفوف والشعب";
  }

  if ($("printDepartureStudentTotal")) {
    $("printDepartureStudentTotal").textContent = records.length;
  }
}

// ========================================
// تحميل السجلات من Firebase
// ========================================

async function loadRecords() {
  if (!currentSchoolId) return;

  const recordsRef = collection(
    db,
    "schools",
    currentSchoolId,
    "records"
  );

  const snapshot = await getDocs(recordsRef);

  schoolRecords = snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data()
  }));

  updateDashboard();
}

// ========================================
// حفظ سجل التأخير أو المغادرة
// ========================================

async function saveRecord(event, type) {
  event.preventDefault();

  if (isSaving) return;

  if (!currentSchoolId) {
    alert("لم يتم تحديد المدرسة.");
    return;
  }

  const isLate = type === "late";

  // في نموذج المغادرة، قيمة القائمة هي student.id.
  // في نموذج التأخير، نحافظ على طريقة الاختيار الحالية.
  const selectedStudentValue = cleanText(
    $(isLate ? "lateStudentName" : "departureStudentName")?.value
  );

  const selectedStudent = isLate
    ? null
    : allStudents.find(
        (student) => student.id === selectedStudentValue
      );

  const studentName = isLate
    ? selectedStudentValue
    : cleanText(selectedStudent?.name);

  const grade = cleanText(
    $(isLate ? "lateGrade" : "departureGrade")?.value
  );

  const date =
    $(isLate ? "lateDate" : "departureDate")?.value || "";

  const time = isLate
    ? ($("lateTime")?.value || localTimeString())
    : ($("departureTime")?.value || localTimeString());

  const reason = cleanText(
    $(isLate ? "lateReason" : "departureReason")?.value
  );

  if (!studentName || !grade || !date || !time) {
    alert("يرجى اختيار الطالب والصف وتعبئة التاريخ والوقت.");
    return;
  }

  let guardianType = "";
  let guardianName = "";
  let otherPersonPhone = "";

  if (!isLate) {
    guardianType = cleanText($("guardianType")?.value);
    otherPersonPhone = cleanText($("otherPersonPhone")?.value);

    if (!guardianType) {
      alert("يرجى اختيار صلة الشخص المستلم.");
      return;
    }

    if (!otherPersonPhone) {
      alert("يرجى إدخال رقم هاتف الشخص المستلم.");
      return;
    }

    if (guardianType === "شخص آخر") {
      guardianName = cleanText($("otherPersonName")?.value);

      if (!guardianName) {
        alert("يرجى إدخال اسم الشخص المستلم.");
        return;
      }
    } else {
      guardianName = guardianType;
    }
  }

  // التحقق من الطالبة بمعرّفها الحقيقي والصف والعام الدراسي
  if (!isLate) {
    const studentExists = Boolean(
      selectedStudent &&
      cleanText(selectedStudent.grade) === grade &&
      studentYear(selectedStudent) === currentAcademicYear &&
      selectedStudent.isActive !== false
    );

    if (!studentExists) {
      alert(
        "الطالبة المحددة غير موجودة في الصف المحدد للعام الحالي. " +
        "يرجى إعادة اختيار الصف والطالبة."
      );
      return;
    }
  }

  const record = {
    type,
    studentName,
    grade,
    date,
    time,
    reason: reason || "",
    academicYear: currentAcademicYear,
    createdAt: serverTimestamp()
  };

  if (!isLate) {
    // إضافة المعرّف حتى تطابق صفحة الغياب الطالبة نفسها
    record.studentId = selectedStudent.id;
    record.guardianType = guardianType;
    record.guardianName = guardianName;
    record.otherPersonPhone = otherPersonPhone;
  }

  isSaving = true;

  const submitButton =
    event.submitter || $(isLate ? "lateForm" : "saveDepartureBtn");

  const originalButtonText = submitButton?.textContent;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "جارٍ الحفظ...";
  }

  try {
    await addDoc(
      collection(db, "schools", currentSchoolId, "records"),
      record
    );

    event.target.reset();

    if (!isLate) {
      toggleOtherPersonFields();

      const studentSelect = $("departureStudentName");

      if (studentSelect) {
        studentSelect.replaceChildren();

        const option = document.createElement("option");
        option.value = "";
        option.textContent = "يرجى اختيار الصف أولًا";

        studentSelect.appendChild(option);
        studentSelect.disabled = true;
      }
    }

    const dateInput = $(isLate ? "lateDate" : "departureDate");

    if (dateInput) {
      dateInput.value = localDateString();
    }

    await loadRecords();
    await loadDepartureStudents();

    alert(`تم حفظ السجل بنجاح للعام الدراسي ${currentAcademicYear}.`);
  } catch (error) {
    console.error("خطأ في حفظ السجل:", error);

    alert(
      "تعذر حفظ السجل. تحققي من اتصال Firebase وصلاحيات قاعدة البيانات."
    );
  } finally {
    isSaving = false;

    if (submitButton) {
      submitButton.disabled = false;

      if (originalButtonText) {
        submitButton.textContent = originalButtonText;
      }
    }
  }
}

$("lateForm")?.addEventListener("submit", (event) => {
  saveRecord(event, "late");
});

$("departureForm")?.addEventListener("submit", (event) => {
  saveRecord(event, "departure");
});

// ========================================
// تسجيل الدخول وتحميل بيانات المدرسة
// ========================================

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    currentSchoolId = user.uid;

    const schoolSnapshot = await getDoc(
      doc(db, "schools", currentSchoolId)
    );

    if (!schoolSnapshot.exists()) {
      alert("لم يتم العثور على بيانات المدرسة المرتبطة بالحساب.");

      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    const school = schoolSnapshot.data();

    if (school.ownerUid !== user.uid) {
      alert("لا تملكين صلاحية الوصول إلى بيانات هذه المدرسة.");

      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    currentAcademicYear =
      school.currentAcademicYear || DEFAULT_YEAR;

    updateAcademicYearDisplay();

    if ($("dashboardSchoolName")) {
      $("dashboardSchoolName").textContent =
        school.schoolName || "اسم المدرسة";
    }

    updatePrintSchoolNames(school.schoolName);

    if ($("sidebarSchoolName")) {
      $("sidebarSchoolName").textContent =
        school.schoolName || "المدرسة";
    }

    if ($("dashboardSchoolCode")) {
      $("dashboardSchoolCode").textContent =
        school.schoolCode || "—";
    }

    if ($("dashboardGreeting")) {
      $("dashboardGreeting").textContent =
        `أهلًا بك في ${school.schoolName || "مدرستك"}`;
    }

    if ($("lateDate")) {
      $("lateDate").value = localDateString();
    }

    if ($("departureDate")) {
      $("departureDate").value = localDateString();
    }

    await loadDepartureStudents();
    await loadRecords();

    openRequestedView();
  } catch (error) {
    console.error("تعذر تحميل لوحة التحكم:", error);

    alert(
      `رمز الخطأ: ${error.code || "غير معروف"}\n` +
      `التفاصيل: ${error.message || "غير معروفة"}`
    );
  }
});

// ========================================
// تصدير التقرير إلى Excel
// ========================================

$("exportReportBtn")?.addEventListener("click", () => {
  if (!window.XLSX) {
    alert("تعذر تحميل مكتبة Excel. تحققي من اتصال الإنترنت.");
    return;
  }

  const fromDate = $("reportFrom")?.value || "";
  const toDate = $("reportTo")?.value || "";
  const reportType = $("reportType")?.value || "all";
  const reportGrade = $("reportGrade")?.value || "all";

  if (fromDate && toDate && fromDate > toDate) {
    alert("تاريخ البداية يجب أن يكون قبل تاريخ النهاية.");
    return;
  }

  const records = getRecordsForYear()
    .filter((record) => {
      if (fromDate && record.date < fromDate) return false;
      if (toDate && record.date > toDate) return false;

      if (reportType !== "all" && record.type !== reportType) {
        return false;
      }

      if (reportGrade !== "all" && record.grade !== reportGrade) {
        return false;
      }

      return true;
    })
    .sort(newestFirst);

  if (!records.length) {
    alert(
      `لا توجد سجلات للعام ${currentAcademicYear} ضمن الفترة المحددة.`
    );
    return;
  }

  const schoolName =
    $("dashboardSchoolName")?.textContent || "اسم المدرسة";

  const recordTypeLabels = {
    late: "تأخير",
    departure: "مغادرة",
    absence: "غياب"
  };

  const rows = [
    ["اسم المدرسة", schoolName],
    ["العام الدراسي", currentAcademicYear],
    ["من تاريخ", fromDate || "جميع التواريخ"],
    ["إلى تاريخ", toDate || "جميع التواريخ"],
    ["الصف", reportGrade === "all" ? "جميع الصفوف" : reportGrade],
    [],
    [
      "اسم الطالب",
      "الصف",
      "نوع السجل",
      "التاريخ",
      "الوقت",
      "السبب",
      "الملاحظات",
      "صلة المستلم",
      "اسم المستلم",
      "رقم الهاتف"
    ],
    ...records.map((record) => [
      record.studentName || "",
      record.grade || "",
      recordTypeLabels[record.type] || record.type || "",
      record.date || "",
      record.time || "",
      record.reason || "",
      record.notes || "",
      record.guardianType || "",
      record.guardianName || "",
      record.otherPersonPhone || ""
    ])
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  worksheet["!cols"] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 30 },
    { wch: 30 },
    { wch: 18 },
    { wch: 25 },
    { wch: 20 }
  ];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "التقرير");

  const reportName = {
    all: "جميع_السجلات",
    late: "تقرير_التأخير",
    departure: "تقرير_المغادرة"
  }[reportType] || "التقرير";

  const fileName =
    `${reportName}_${currentAcademicYear.replace(/\s/g, "")}_` +
    `${fromDate || "البداية"}_${toDate || "النهاية"}.xlsx`;

  XLSX.writeFile(workbook, fileName);
});
