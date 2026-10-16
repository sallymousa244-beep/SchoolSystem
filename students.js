
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const DEFAULT_YEAR = "2026 / 2027";

let currentSchoolId = null;
let allStudents = [];
let allStudentRecords = [];
let isSaving = false;
let currentAcademicYear = DEFAULT_YEAR;

function getStudentsCollection() {
  if (!currentSchoolId) {
    throw new Error("لم يتم تحديد المدرسة.");
  }

  return collection(db, "schools", currentSchoolId, "students");
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function studentKey(name, grade) {
  return `${normalizeText(name)}|${normalizeText(grade)}`;
}

function studentYear(student) {
  // السجلات القديمة التي لا تحتوي على عام تُعامل كعام 2026/2027
  return student.academicYear || DEFAULT_YEAR;
}

function isActive(student) {
  // الطلاب القديمات اللواتي لا يحتوي سجلّهن على isActive يُعتبرن فعّالات
  return student.isActive !== false;
}

function showMessage(id, message, type = "info") {
  const element = $(id);
  if (!element) return;

  element.textContent = message;

  const colors = {
    success: "#16835d",
    error: "#b42318",
    info: "#526b91"
  };

  element.style.color = colors[type] || colors.info;
}

function getSelectedAcademicYear() {
  return cleanText($("academicYearSelect")?.value) || DEFAULT_YEAR;
}

function refreshYearStudents() {
  currentAcademicYear = getSelectedAcademicYear();

  allStudents = allStudentRecords.filter((student) =>
    studentYear(student) === currentAcademicYear && isActive(student)
  );

  updateGradeOptions();
  renderStudents();
}

function prepareGradeInput() {
  $("availableStudentGrades")?.remove();
}

function showEmptyRow(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = 3;
  cell.className = "empty-state";
  cell.textContent = message;
  row.appendChild(cell);

  return row;
}

function updateGradeOptions() {
  const grades = [
    ...new Set(
      allStudents
        .map((student) => cleanText(student.grade))
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, "ar"));

  const gradeInput = $("studentGradeInput");

  if (gradeInput) {
    const selectedGrade = gradeInput.value;

    gradeInput.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "يرجى اختيار الصف والشعبة";
    gradeInput.appendChild(placeholder);

    grades.forEach((grade) => {
      const option = document.createElement("option");
      option.value = grade;
      option.textContent = grade;
      gradeInput.appendChild(option);
    });

    if (grades.includes(selectedGrade)) {
      gradeInput.value = selectedGrade;
    }
  }

  const filter = $("studentGradeFilter");

  if (filter) {
    const selectedGrade = filter.value;

    filter.replaceChildren();

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "جميع الصفوف والشعب";
    filter.appendChild(defaultOption);

    grades.forEach((grade) => {
      const option = document.createElement("option");
      option.value = grade;
      option.textContent = grade;
      filter.appendChild(option);
    });

    if (grades.includes(selectedGrade)) {
      filter.value = selectedGrade;
    }
  }

  if ($("totalClassesCount")) {
    $("totalClassesCount").textContent = grades.length;
  }
}

function createActionButton(text, action, color) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = text;
  button.dataset.action = action;
  button.style.margin = "3px";
  button.style.padding = "7px 11px";
  button.style.border = "none";
  button.style.borderRadius = "7px";
  button.style.background = color;
  button.style.color = "#ffffff";
  button.style.cursor = "pointer";

  return button;
}

function renderStudents() {
  const tbody = $("studentsTableBody");
  if (!tbody) return;

  const searchText = normalizeText($("studentSearch")?.value || "");
  const selectedGrade = $("studentGradeFilter")?.value || "";

  const filteredStudents = allStudents
    .filter((student) => {
      const matchesName = normalizeText(student.name).includes(searchText);
      const matchesGrade = !selectedGrade || student.grade === selectedGrade;

      return matchesName && matchesGrade;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  tbody.replaceChildren();

  if (!filteredStudents.length) {
    tbody.appendChild(
      showEmptyRow(
        allStudents.length
          ? "لا توجد نتائج مطابقة للبحث."
          : `لا توجد طالبات فعّالات للعام الدراسي ${currentAcademicYear}.`
      )
    );
  } else {
    filteredStudents.forEach((student) => {
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.textContent = student.name;

      const gradeCell = document.createElement("td");
      gradeCell.textContent = student.grade;

      const actionsCell = document.createElement("td");

      const editButton = createActionButton("تعديل", "edit", "#526b91");
      const archiveButton = createActionButton("إخراج من القائمة", "archive", "#b42318");

      editButton.dataset.id = student.id;
      archiveButton.dataset.id = student.id;

      actionsCell.append(editButton, archiveButton);
      row.append(nameCell, gradeCell, actionsCell);
      tbody.appendChild(row);
    });
  }

  if ($("totalStudentsCount")) {
    $("totalStudentsCount").textContent = allStudents.length;
  }
}

async function loadStudents() {
  if (!currentSchoolId) return;

  try {
    const snapshot = await getDocs(getStudentsCollection());

    allStudentRecords = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    refreshYearStudents();

    showMessage(
      "studentsListMessage",
      `تم تحميل ${allStudents.length} طالبة فعّالة للعام ${currentAcademicYear}.`,
      "success"
    );
  } catch (error) {
    console.error("خطأ في تحميل الطلاب:", error);

    showMessage(
      "studentsListMessage",
      "تعذر تحميل الطلاب. تحققي من اتصال Firebase وصلاحيات قاعدة البيانات.",
      "error"
    );
  }
}

function resetStudentForm() {
  $("studentForm")?.reset();

  if ($("studentDocId")) $("studentDocId").value = "";

  if ($("studentFormTitle")) {
    $("studentFormTitle").textContent = "إضافة طالبة";
  }

  if ($("saveStudentBtn")) {
    $("saveStudentBtn").textContent = "حفظ البيانات";
    $("saveStudentBtn").disabled = false;
  }

  if ($("cancelStudentEditBtn")) {
    $("cancelStudentEditBtn").hidden = true;
  }

  showMessage("studentFormMessage", "");
}

$("cancelStudentEditBtn")?.addEventListener("click", resetStudentForm);

$("studentForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSaving) return;

  if (!currentSchoolId) {
    showMessage("studentFormMessage", "لم يتم تحديد المدرسة.", "error");
    return;
  }

  const name = cleanText($("studentNameInput")?.value);
  const grade = cleanText($("studentGradeInput")?.value);
  const studentId = $("studentDocId")?.value || "";

  if (!name || !grade) {
    showMessage("studentFormMessage", "يرجى إدخال اسم الطالب والصف والشعبة.", "error");
    return;
  }

  const duplicate = allStudents.some((student) =>
    studentKey(student.name, student.grade) === studentKey(name, grade) &&
    student.id !== studentId
  );

  if (duplicate) {
    showMessage("studentFormMessage", "هذه الطالب موجودة بالفعل في الصف والشعبة المحددين.", "error");
    return;
  }

  isSaving = true;
  const saveButton = $("saveStudentBtn");
  if (saveButton) saveButton.disabled = true;

  try {
    if (studentId) {
      const studentRef = doc(db, "schools", currentSchoolId, "students", studentId);

      await updateDoc(studentRef, {
        name,
        grade,
        academicYear: currentAcademicYear,
        isActive: true,
        updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(getStudentsCollection(), {
        name,
        grade,
        academicYear: currentAcademicYear,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    resetStudentForm();
    await loadStudents();

    showMessage(
      "studentFormMessage",
      studentId ? "تم تعديل بيانات الطالب بنجاح." : "تمت إضافة الطالب بنجاح.",
      "success"
    );
  } catch (error) {
    console.error("خطأ في حفظ الطالب:", error);
    showMessage("studentFormMessage", "تعذر حفظ البيانات. تحققي من صلاحيات Firebase.", "error");
  } finally {
    isSaving = false;
    if (saveButton) saveButton.disabled = false;
  }
});

$("studentsTableBody")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const student = allStudents.find((item) => item.id === button.dataset.id);
  if (!student) return;

  if (button.dataset.action === "edit") {
    $("studentDocId").value = student.id;
    $("studentNameInput").value = student.name;
    $("studentGradeInput").value = student.grade;

    $("studentFormTitle").textContent = "تعديل بيانات الطالب";
    $("saveStudentBtn").textContent = "حفظ التعديلات";
    $("cancelStudentEditBtn").hidden = false;

    $("studentForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (button.dataset.action === "archive") {
    const confirmed = window.confirm(
      `سيتم إخراج "${student.name}" من قائمة العام ${currentAcademicYear} دون حذف سجله أو سجلات التأخير والمغادرة. هل تريد المتابعة؟`
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
      await updateDoc(
        doc(db, "schools", currentSchoolId, "students", student.id),
        {
          isActive: false,
          updatedAt: serverTimestamp()
        }
      );

      if ($("studentDocId")?.value === student.id) resetStudentForm();

      await loadStudents();

      showMessage("studentsListMessage", "تم إخراج الطالب من القائمة مع الاحتفاظ بسجله.", "success");
    } catch (error) {
      console.error("خطأ في أرشفة الطالب:", error);
      showMessage("studentsListMessage", "تعذر تحديث حالة الطالب.", "error");
    } finally {
      button.disabled = false;
    }
  }
});

$("studentSearch")?.addEventListener("input", renderStudents);
$("studentGradeFilter")?.addEventListener("change", renderStudents);

$("academicYearSelect")?.addEventListener("change", async () => {
  const selectedYear = getSelectedAcademicYear();

  if (!currentSchoolId) return;

  const yearSelect = $("academicYearSelect");

  if (yearSelect) yearSelect.disabled = true;

  try {
    await updateDoc(
      doc(db, "schools", currentSchoolId),
      {
        currentAcademicYear: selectedYear,
        updatedAt: serverTimestamp()
      }
    );

    currentAcademicYear = selectedYear;

    resetStudentForm();
    await loadStudents();

    showMessage(
      "studentsListMessage",
      `تم اعتماد العام الدراسي ${selectedYear}.`,
      "success"
    );
  } catch (error) {
    console.error("خطأ في حفظ العام الدراسي:", error);

    if (yearSelect) {
      yearSelect.value = currentAcademicYear;
    }

    showMessage(
      "studentsListMessage",
      "تعذر حفظ العام الدراسي. حاولي مرة أخرى.",
      "error"
    );
  } finally {
    if (yearSelect) yearSelect.disabled = false;
  }
});
$("downloadStudentsTemplateBtn")?.addEventListener("click", () => {
  if (!window.XLSX) {
    showMessage("studentsImportMessage", "تعذر تحميل مكتبة Excel.", "error");
    return;
  }

  const rows = [
    ["اسم الطالب", "الصف والشعبة"],
    ["مثال تجريبي 1", "العاشر أ"],
    ["مثال تجريبي 2", "العاشر ب"]
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 30 }, { wch: 22 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "الطلاب");
  XLSX.writeFile(workbook, "قالب_بيانات_الطلاب.xlsx");
});

function normalizeHeader(value) {
  return cleanText(value)
    .replace(/[\s_*:：\-ـ]/g, "")
    .toLowerCase();
}

function findColumn(headers, possibleNames) {
  return headers.findIndex((header) =>
    possibleNames.includes(normalizeHeader(header))
  );
}

$("importStudentsBtn")?.addEventListener("click", async () => {
  if (!currentSchoolId) {
    showMessage("studentsImportMessage", "لم يتم تحديد المدرسة.", "error");
    return;
  }

  if (!window.XLSX) {
    showMessage("studentsImportMessage", "تعذر تحميل مكتبة Excel.", "error");
    return;
  }

  const file = $("studentsCsvFile")?.files?.[0];

  if (!file) {
    showMessage("studentsImportMessage", "يرجى اختيار ملف Excel أولًا.", "error");
    return;
  }

  const extension = file.name.split(".").pop().toLowerCase();

  if (!["xlsx", "xls"].includes(extension)) {
    showMessage("studentsImportMessage", "يرجى اختيار ملف XLSX أو XLS.", "error");
    return;
  }

  const importButton = $("importStudentsBtn");
  importButton.disabled = true;

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    if (!workbook.SheetNames.length) {
      throw new Error("الملف لا يحتوي على أوراق عمل.");
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false
    });

    if (rows.length < 2) {
      throw new Error("أضيفي بيانات الطلاب تحت عناوين الأعمدة.");
    }

    const headers = rows[0];

    const nameIndex = findColumn(headers, [
      "اسمالطالب", "اسمالطالب", "اسمالطالب/ة", "اسم",
      "studentname", "name"
    ]);

    const gradeIndex = findColumn(headers, [
      "الصفوالشعبة", "الصفالشعبة", "الصف", "الشعبة",
      "grade", "class", "classname"
    ]);

    if (nameIndex === -1 || gradeIndex === -1) {
      throw new Error("يجب أن يحتوي الملف على عمود اسم الطالب وعمود الصف والشعبة.");
    }

    const imported = new Map();
    let incomplete = 0;

    for (const row of rows.slice(1)) {
      const name = cleanText(row[nameIndex]);
      const grade = cleanText(row[gradeIndex]);

      if (!name && !grade) continue;

      if (!name || !grade) {
        incomplete++;
        continue;
      }

      imported.set(studentKey(name, grade), { name, grade });
    }

    if (!imported.size) {
      throw new Error("لم يتم العثور على بيانات طالبات مكتملة في الملف.");
    }

    // نقرأ كل السجلات حتى نحدّث سجلات العام المختار فقط.
    const snapshot = await getDocs(getStudentsCollection());

    const existingForYear = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((student) => studentYear(student) === currentAcademicYear);

    const existingByKey = new Map();

    for (const student of existingForYear) {
      const key = studentKey(student.name, student.grade);

      // إذا كان هناك سجل مكرر قديم بنفس الاسم والصف، نحتفظ بأحدها
      if (!existingByKey.has(key)) existingByKey.set(key, student);
    }

    const newEntries = [];
    const updates = [];
    const keysInFile = new Set(imported.keys());

    for (const [key, importedStudent] of imported) {
      const existing = existingByKey.get(key);

      if (existing) {
        if (
          existing.isActive === false ||
          !existing.academicYear ||
          existing.name !== importedStudent.name ||
          existing.grade !== importedStudent.grade
        ) {
          updates.push({
            id: existing.id,
            data: {
              name: importedStudent.name,
              grade: importedStudent.grade,
              academicYear: currentAcademicYear,
              isActive: true,
              updatedAt: serverTimestamp()
            }
          });
        }
      } else {
        newEntries.push(importedStudent);
      }
    }

    // الغائبات عن ملف Excel تُعطّل ولا تُحذف
    const toArchive = existingForYear.filter((student) =>
      isActive(student) &&
      !keysInFile.has(studentKey(student.name, student.grade))
    );

    const operationCount = updates.length + toArchive.length + newEntries.length;

    const confirmed = window.confirm(
      `العام الدراسي: ${currentAcademicYear}\n\n` +
      `طالبات جديدات: ${newEntries.length}\n` +
      `سجلات ستُحدّث أو تُفعّل: ${updates.length}\n` +
      `إخراج طالبات من القائمة دون حذف سجلاتهم: ${toArchive.length}\n` +
      `صفوف ناقصة البيانات تم تجاهلها: ${incomplete}\n\n` +
      `لن يتم حذف سجلات الطلاب أو سجلات التأخير والمغادرة. هل تريد المتابعة؟`
    );

    if (!confirmed) return;

    // Firebase يسمح بحد أقصى 500 عملية في الدفعة؛ نستخدم 400 احتياطًا.
    const operations = [];

    for (const item of updates) {
      operations.push((batch) => {
        batch.update(
          doc(db, "schools", currentSchoolId, "students", item.id),
          item.data
        );
      });
    }

    for (const student of toArchive) {
      operations.push((batch) => {
        batch.update(
          doc(db, "schools", currentSchoolId, "students", student.id),
          {
            isActive: false,
            updatedAt: serverTimestamp()
          }
        );
      });
    }

    for (const student of newEntries) {
      operations.push((batch) => {
        batch.set(doc(getStudentsCollection()), {
          name: student.name,
          grade: student.grade,
          academicYear: currentAcademicYear,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
    }

    for (let start = 0; start < operations.length; start += 400) {
      const batch = writeBatch(db);

      operations.slice(start, start + 400).forEach((operation) => operation(batch));

      await batch.commit();
    }

    await loadStudents();

    showMessage(
      "studentsImportMessage",
      `اكتمل تحديث العام ${currentAcademicYear}. أُضيفت ${newEntries.length}، وفُعّلت أو حُدّثت ${updates.length}، وأُخرجت من القائمة ${toArchive.length}.`,
      "success"
    );

    $("studentsCsvFile").value = "";
  } catch (error) {
    console.error("خطأ في استيراد الطلاب:", error);

    showMessage(
      "studentsImportMessage",
      error.message || "تعذر استيراد الملف. تحققي من الملف وصلاحيات Firebase.",
      "error"
    );
  } finally {
    importButton.disabled = false;
  }
});

prepareGradeInput();

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
      alert("لم يتم العثور على بيانات المدرسة.");
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    const school = schoolSnapshot.data();

    if (school.ownerUid !== user.uid) {
      alert("ليست لديك صلاحية الوصول إلى بيانات المدرسة.");
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    if ($("sidebarSchoolName")) {
      $("sidebarSchoolName").textContent = school.schoolName || "المدرسة";
    }

    const savedYear = school.currentAcademicYear || DEFAULT_YEAR;
const yearSelect = $("academicYearSelect");

if (
  yearSelect &&
  [...yearSelect.options].some((option) => option.value === savedYear)
) {
  yearSelect.value = savedYear;
}

currentAcademicYear = savedYear;

// حفظ العام الافتراضي للحسابات التي لم تحدد عامًا من قبل
if (!school.currentAcademicYear) {
  await updateDoc(
    doc(db, "schools", currentSchoolId),
    {
      currentAcademicYear: DEFAULT_YEAR,
      updatedAt: serverTimestamp()
    }
  );
}

await loadStudents();
  } catch (error) {
    console.error("خطأ في التحقق من المدرسة:", error);

    showMessage(
      "studentsListMessage",
      "تعذر تحميل الصفحة. تحققي من اتصال Firebase وقواعد الأمان.",
      "error"
    );
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);
    alert("تعذر تسجيل الخروج.");
  }
});
