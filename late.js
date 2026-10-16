
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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let currentSchoolId = null;
let currentAcademicYear = "2026 / 2027";
let students = [];

function showMessage(message, type = "info") {
  const element = $("lateMessage");
  if (!element) return;

  element.textContent = message;
  element.style.color =
    type === "error" ? "#b42318" :
    type === "success" ? "#16835d" : "#526b91";
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

// تحميل الصفوف والشعب من قاعدة البيانات
function loadGrades() {
  const gradeSelect = $("lateGrade");
  const studentSelect = $("lateStudentName");

  gradeSelect.replaceChildren();
  gradeSelect.add(new Option("يرجى اختيار الصف والشعبة", ""));

  const grades = [...new Set(
    students.map((student) => cleanText(student.grade)).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "ar"));

  grades.forEach((grade) => {
    gradeSelect.add(new Option(grade, grade));
  });

  studentSelect.replaceChildren();
  studentSelect.add(new Option("يرجى اختيار الصف أولًا", ""));
  studentSelect.disabled = true;

  if (grades.length === 0) {
    showMessage("لم يتم العثور على صفوف. يرجى التأكد من إضافة الطلاب من صفحة إدارة الطلاب.");
  }
}

// تحميل أسماء الطلاب حسب الصف والشعبة المختارة
$("lateGrade").addEventListener("change", () => {
  const selectedGrade = $("lateGrade").value;
  const studentSelect = $("lateStudentName");

  studentSelect.replaceChildren();
  studentSelect.add(new Option("يرجى اختيار اسم الطالب", ""));

  const matchingStudents = students
    .filter((student) =>
      cleanText(student.grade) === selectedGrade &&
      (student.academicYear || "2026 / 2027") === currentAcademicYear &&
      student.isActive !== false
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  matchingStudents.forEach((student) => {
    studentSelect.add(new Option(student.name, student.id));
  });

  studentSelect.disabled = matchingStudents.length === 0;

  if (!selectedGrade) {
    studentSelect.replaceChildren();
    studentSelect.add(new Option("يرجى اختيار الصف أولًا", ""));
    studentSelect.disabled = true;
  }
});

// التاريخ والوقت الحاليان
function updateDateTime() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  $("lateDate").value = `${year}-${month}-${day}`;

  $("lateTime").value =
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

updateDateTime();

// تسجيل التأخير
$("lateForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentSchoolId) {
    showMessage("لم يتم تحديد المدرسة.", "error");
    return;
  }

  const grade = $("lateGrade").value;
  const studentId = $("lateStudentName").value;
  const student = students.find((item) => item.id === studentId);
  const reason = $("lateReason").value;
  const notes = $("lateNotes").value.trim();

  if (!grade || !student) {
    showMessage("يرجى اختيار الصف واسم الطالب.", "error");
    return;
  }

  const saveButton = $("saveLateBtn");
  saveButton.disabled = true;

  try {
    await addDoc(
  collection(db, "schools", currentSchoolId, "records"),
      {
        type: "late",
        studentId: student.id,
        studentName: student.name,
        grade: student.grade,
        date: $("lateDate").value,
        time: $("lateTime").value,
        reason,
        notes,
        academicYear: currentAcademicYear,
        createdAt: serverTimestamp()
      }
    );

    showMessage("تم حفظ سجل التأخير بنجاح.", "success");
    $("lateForm").reset();

    $("lateStudentName").replaceChildren(
      new Option("يرجى اختيار الصف أولًا", "")
    );
    $("lateStudentName").disabled = true;

    updateDateTime();
  
  } catch (error) {
    console.error("خطأ في حفظ التأخير:", error);

    showMessage(
      `تعذر الحفظ: ${error.code || ""} - ${error.message || "خطأ غير معروف"}`,
      "error"
    );
    } finally {
    saveButton.disabled = false;
  }
});

// تسجيل الخروج


// تسجيل الخروج
$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);
    showMessage("تعذر تسجيل الخروج.", "error");
  }
});

// التحقق من حساب المدرسة ثم تحميل بيانات الطلاب
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

    if (!schoolSnapshot.exists() ||
        schoolSnapshot.data().ownerUid !== user.uid) {
      showMessage("لا توجد صلاحية للوصول إلى بيانات المدرسة.", "error");
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    const schoolData = schoolSnapshot.data();
    currentAcademicYear = schoolData.currentAcademicYear || "2026 / 2027";
    $("sidebarSchoolName").textContent =
      schoolData.schoolName || "المدرسة";

    const snapshot = await getDocs(
      collection(db, "schools", currentSchoolId, "students")
    );

    students = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    })).filter((student) =>
      student.name &&
      student.grade &&
      (student.academicYear || "2026 / 2027") === currentAcademicYear &&
      student.isActive !== false
    );

    loadGrades();

 
  } catch (error) {
    console.error("خطأ في تحميل بيانات صفحة التأخير:", error);

    showMessage(
      `تعذر تحميل البيانات: ${error.code || ""} - ${error.message || "خطأ غير معروف"}`,
      "error"
    );
  }
});

