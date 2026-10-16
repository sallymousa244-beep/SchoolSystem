
import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// توحيد الأرقام العربية والإنجليزية
function normalizeSchoolCode(value) {
  return value.trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
}

// البريد الداخلي المستخدم في Firebase
function schoolEmail(code) {
  return `school-${code}@schools-login.example.com`;
}

// التنقل بين صفحات الموقع
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.hidden = true;
  });

  const page = document.getElementById(pageId);

  if (page) {
    page.hidden = false;
    page.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

window.showPage = showPage;


// عرض معلومات المدرسة في لوحة التحكم

function displaySchool(school) {
  window.location.href = "dashboard.html";
}

// تسجيل مدرسة جديدة أو استكمال حساب تجريبي
document.getElementById("registerForm").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const schoolName =
      document.getElementById("schoolName").value.trim();

    const schoolCode = normalizeSchoolCode(
      document.getElementById("schoolCode").value
    );

    const password =
      document.getElementById("registerPassword").value;

    const confirmPassword =
      document.getElementById("confirmPassword").value;

    if (!schoolName || !schoolCode || !password || !confirmPassword) {
      alert("يرجى تعبئة جميع الحقول");
      return;
    }

    if (!/^[0-9]+$/.test(schoolCode)) {
      alert("يرجى إدخال الرقم الوطني باستخدام الأرقام فقط");
      return;
    }

    if (password.length < 6) {
      alert("كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل");
      return;
    }

    if (password !== confirmPassword) {
      alert("كلمتا المرور غير متطابقتين");
      return;
    }

    let createdNewAccount = false;

    try {
      let user;

      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          schoolEmail(schoolCode),
          password
        );

        user = credential.user;
        createdNewAccount = true;

      } catch (error) {
        if (error.code !== "auth/email-already-in-use") {
          throw error;
        }

        const credential = await signInWithEmailAndPassword(
          auth,
          schoolEmail(schoolCode),
          password
        );

        user = credential.user;
      }

      const schoolRef = doc(db, "schools", user.uid);
      const schoolSnapshot = await getDoc(schoolRef);

      if (schoolSnapshot.exists()) {
        alert("المدرسة مسجلة بالفعل. يمكنك الدخول من صفحة تسجيل الدخول.");
        document.getElementById("registerForm").reset();
        showPage("login");
        return;
      }

      // لا نكمل الاستكمال إلا للحساب الذي تم تسجيله في هذه العملية،
      // أو للحساب التجريبي الذي دخلنا إليه للتو.
      await setDoc(schoolRef, {
        schoolName: schoolName,
        schoolCode: schoolCode,
        ownerUid: user.uid,
        createdAt: serverTimestamp()
      });

      alert("تم إنشاء حساب المدرسة بنجاح. يمكنك الآن تسجيل الدخول.");

document.getElementById("registerForm").reset();
document.getElementById("loginForm").reset();

showPage("login");

    } catch (error) {
      console.error("Registration error:", error);

      if (error.code === "auth/invalid-credential") {
        alert("كلمة المرور غير صحيحة للحساب الموجود.");
      } else if (
        error.code === "permission-denied" ||
        error.code === "firestore/permission-denied"
      ) {
        alert("قواعد Firestore تمنع حفظ بيانات المدرسة.");
      } else {
        alert("تعذر إكمال التسجيل. تحققي من وحدة التحكم لمعرفة الخطأ.");
      }
    }
  }
);

// تسجيل الدخول وعرض لوحة التحكم
document.getElementById("loginForm").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const schoolCode = normalizeSchoolCode(
      document.getElementById("loginUsername").value
    );

    const password =
      document.getElementById("loginPassword").value;

    if (!/^[0-9]+$/.test(schoolCode)) {
      alert("يرجى إدخال الرقم الوطني باستخدام الأرقام فقط");
      return;
    }

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        schoolEmail(schoolCode),
        password
      );

      const schoolRef = doc(db, "schools", credential.user.uid);
      const schoolSnapshot = await getDoc(schoolRef);

      if (!schoolSnapshot.exists()) {
        await signOut(auth);
        alert("الحساب موجود لكن بيانات المدرسة غير محفوظة.");
        showPage("register");
        return;
      }

      const school = schoolSnapshot.data();

      if (
        school.ownerUid !== credential.user.uid ||
        school.schoolCode !== schoolCode
      ) {
        await signOut(auth);
        alert("تعذر التحقق من بيانات المدرسة.");
        return;
      }

      displaySchool(school);
      document.getElementById("loginForm").reset();

    } catch (error) {
      console.error("Login error:", error);

      if (error.code === "auth/invalid-credential") {
        alert("الرقم الوطني أو كلمة المرور غير صحيحة.");
      } else if (error.code === "permission-denied") {
        alert("لا توجد صلاحية لقراءة بيانات المدرسة.");
      } else {
        alert("تعذر تسجيل الدخول. تحققي من وحدة التحكم لمعرفة السبب.");
      }
    }
  }
);

// تسجيل الخروج
window.logoutSchool = async function () {
  try {
    await signOut(auth);
    showPage("welcome");
    alert("تم تسجيل الخروج بنجاح");
  } catch (error) {
    console.error("Logout error:", error);
    alert("تعذر تسجيل الخروج.");
  }
};
