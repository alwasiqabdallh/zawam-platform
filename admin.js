
const API = "/api/admin";

let selectedCourseId = null;
let adminCourses = [];
let adminSpecialties = [];

document.addEventListener("DOMContentLoaded", initializeAdmin);

// ============================================================
// INITIALIZATION
// ============================================================

async function initializeAdmin() {
    try {
        await loadAdminInfo();

        await Promise.allSettled([
            loadDashboard(),
            loadCourses(),
            loadUsers(),
            loadCertificates(),
            loadSpecialties()
        ]);

        populateCourseSelects();
        populateSpecialtySelect();
    } catch (error) {
        console.error("Admin initialization error:", error);
        showToast(error.message || "تعذر تهيئة لوحة الإدارة.", "error");
    }
}

// ============================================================
// API
// ============================================================

async function apiRequest(url, options = {}) {
    const token = localStorage.getItem("zawamAdminToken");

    const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
        ...options,
        credentials: "same-origin",
        headers
    });

    const text = await response.text();
    let data = {};

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { message: text || "استجابة غير صالحة من الخادم." };
    }

    if (response.status === 401) {
        [
            "zawamAdminLoggedIn",
            "zawamAdminToken",
            "zawamAdminName",
            "zawamAdminEmail",
            "zawamAdminId"
        ].forEach(key => localStorage.removeItem(key));

        if (!window.location.pathname.includes("admin-login.html")) {
            window.location.href = "/admin-login.html";
        }

        throw new Error(data.message || "انتهت جلسة الأدمن. سجّل الدخول مجددًا.");
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || data.error || `حدث خطأ (${response.status})`);
    }

    return data;
}

// ============================================================
// ADMIN INFO AND DASHBOARD
// ============================================================

async function loadAdminInfo() {
    const data = await apiRequest(`${API}/me`);
    const admin = data.admin || {};
    const name = admin.name || "مدير المنصة";

    localStorage.setItem("zawamAdminLoggedIn", "true");
    localStorage.setItem("zawamAdminName", name);
    localStorage.setItem("zawamAdminEmail", admin.email || "");

    setText(["adminName", "admin-name", "profileName"], name);
    setText(["adminEmail", "admin-email", "profileEmail"], admin.email || "");
}

async function loadDashboard() {
    try {
        const data = await apiRequest(`${API}/dashboard`);
        const stats = data.stats || {};

        setText(["coursesCount", "totalCourses", "total-courses"],
            stats.totalCourses ?? stats.total_courses ?? stats.courses ?? 0);

        setText(["lessonsCount", "totalLessons", "total-lessons"],
            stats.totalLessons ?? stats.total_lessons ?? stats.lessons ?? 0);

        setText(["usersCount", "totalUsers", "total-users"],
            stats.totalUsers ?? stats.total_users ?? stats.users ?? 0);

        setText(["certificatesCount", "totalCertificates", "total-certificates"],
            stats.totalCertificates ?? stats.total_certificates ?? stats.certificates ?? 0);
    } catch (error) {
        console.error("Dashboard error:", error);
        showToast(error.message || "تعذر تحميل لوحة التحكم.", "error");
    }
}

// ============================================================
// COURSES
// ============================================================

async function loadCourses() {
    const body = document.getElementById("coursesTableBody");

    try {
        const data = await apiRequest(`${API}/courses`);
        adminCourses = Array.isArray(data.courses) ? data.courses : [];
        window.zawamCourses = adminCourses;

        renderCourses(adminCourses);
        populateCourseSelects();
        populateSpecialtySelect();
    } catch (error) {
        console.error("Courses error:", error);

        if (body) {
            body.innerHTML = `<tr><td colspan="6" class="empty-row">تعذر تحميل الدورات: ${escapeHTML(error.message)}</td></tr>`;
        }

        showToast(error.message || "تعذر تحميل الدورات.", "error");
    }
}

function renderCourses(courses) {
    const body = document.getElementById("coursesTableBody");
    if (!body) return;

    if (!courses.length) {
        body.innerHTML = `<tr><td colspan="6" class="empty-row">لا توجد دورات حاليًا</td></tr>`;
        return;
    }

    body.innerHTML = courses.map(course => `
        <tr>
            <td>${escapeHTML(course.id)}</td>
            <td>${escapeHTML(course.title || "بدون عنوان")}</td>
            <td>${escapeHTML(course.category || "غير محدد")}</td>
            <td>${escapeHTML(course.instructor || "غير محدد")}</td>
            <td>${escapeHTML(course.duration || "-")}</td>
            <td>
                <button type="button" class="table-action edit-action"
                    onclick="openLessonModal(${Number(course.id)})">المحاضرات</button>
                <button type="button" class="table-action edit-action"
                    onclick="editCourse(${Number(course.id)})">تعديل</button>
                <button type="button" class="table-action delete-action"
                    onclick="deleteCourse(${Number(course.id)})">حذف</button>
            </td>
        </tr>
    `).join("");
}

function filterCourses() {
    const search = String(document.getElementById("courseSearch")?.value || "")
        .trim().toLowerCase();

    if (!search) return renderCourses(adminCourses);

    renderCourses(adminCourses.filter(course =>
        [course.id, course.title, course.category, course.instructor, course.duration]
            .join(" ").toLowerCase().includes(search)
    ));
}

function openCourseModal(course = null) {
    const modal = document.getElementById("courseModal");
    const form = document.getElementById("courseForm");
    if (!modal || !form) return;

    form.reset();
    populateSpecialtySelect();

    setValue("courseId", course?.id || "");
    setValue("courseTitle", course?.title || "");
    setValue("courseDescription", course?.description || "");
    setValue("courseInstructor", course?.instructor || "");
    setValue("courseDuration", course?.duration || "");

    const category = String(course?.category || "");
    const select = document.getElementById("courseCategory");

    if (select && category && !Array.from(select.options).some(o => o.value === category)) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
    }

    if (select) select.value = category;

    const title = document.getElementById("courseModalTitle");
    if (title) title.textContent = course ? "تعديل الدورة" : "إضافة دورة جديدة";

    modal.classList.add("show");
    modal.style.display = "flex";
}

function closeCourseModal() {
    hideModal("courseModal");
}

function editCourse(id) {
    const course = adminCourses.find(item => Number(item.id) === Number(id));
    if (!course) return showToast("لم يتم العثور على الدورة.", "error");
    openCourseModal(course);
}

async function saveCourse(event) {
    event?.preventDefault();

    const id = getValue("courseId");
    const courseData = {
        title: getValue("courseTitle"),
        description: getValue("courseDescription"),
        category: getValue("courseCategory"),
        instructor: getValue("courseInstructor"),
        duration: getValue("courseDuration")
    };

    if (!courseData.title || !courseData.category || !courseData.instructor) {
        return showToast("أكمل اسم الدورة والتصنيف والمدرب.", "error");
    }

    const button = document.querySelector("#courseForm button[type='submit']");
    if (button) button.disabled = true;

    try {
        const url = id
            ? `${API}/courses/${encodeURIComponent(id)}`
            : `${API}/courses`;

        await apiRequest(url, {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(courseData)
        });

        showToast(id ? "تم تعديل الدورة بنجاح." : "تمت إضافة الدورة بنجاح.", "success");
        closeCourseModal();
        await loadCourses();
        await loadDashboard();
    } catch (error) {
        console.error("Save course error:", error);
        showToast(error.message || "تعذر حفظ الدورة.", "error");
    } finally {
        if (button) button.disabled = false;
    }
}

async function deleteCourse(id) {
    if (!confirm("هل أنت متأكد من حذف هذه الدورة؟")) return;

    try {
        await apiRequest(`${API}/courses/${encodeURIComponent(id)}`, { method: "DELETE" });
        showToast("تم حذف الدورة بنجاح.", "success");
        await loadCourses();
        await loadDashboard();
    } catch (error) {
        console.error("Delete course error:", error);
        showToast(error.message || "تعذر حذف الدورة.", "error");
    }
}

// ============================================================
// COURSE SELECTS
// ============================================================

function populateCourseSelects() {
    ["lessonCourseSelect", "lessonCourse"].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        const previous = String(
            id === "lessonCourse" ? (selectedCourseId || select.value) : select.value
        );

        select.innerHTML = `<option value="">اختر الدورة</option>`;

        adminCourses.forEach(course => {
            const option = document.createElement("option");
            option.value = String(course.id);
            option.textContent = course.title || `الدورة ${course.id}`;
            select.appendChild(option);
        });

        if (adminCourses.some(course => String(course.id) === previous)) {
            select.value = previous;
        }
    });
}

// ============================================================
// LESSONS
// ============================================================

async function loadAdminLessons() {
    const select = document.getElementById("lessonCourseSelect");
    const courseId = Number(select?.value);
    const body = document.getElementById("lessonsTableBody");

    if (!Number.isInteger(courseId) || courseId <= 0) {
        if (body) body.innerHTML =
            `<tr><td colspan="5" class="empty-row">اختر دورة لعرض المحاضرات</td></tr>`;
        selectedCourseId = null;
        return;
    }

    selectedCourseId = courseId;
    setValue("lessonCourse", courseId);
    await loadLessons(courseId);
}

async function openLessonModal(courseId = null) {
    let id = Number(courseId);

    if (!Number.isInteger(id) || id <= 0) {
        id = Number(document.getElementById("lessonCourseSelect")?.value);
    }

    if (!Number.isInteger(id) || id <= 0) {
        id = Number(document.getElementById("lessonCourse")?.value);
    }

    if (!Number.isInteger(id) || id <= 0) {
        showSectionByName("lessons");
        populateCourseSelects();
        return showToast("اختر دورة أولًا لإضافة محاضرة.", "error");
    }

    selectedCourseId = id;
    showSectionByName("lessons");
    populateCourseSelects();

    setValue("lessonCourse", id);
    setValue("lessonCourseSelect", id);

    const form = document.getElementById("lessonForm");
    if (form) {
        form.reset();
        setValue("lessonCourse", id);
        setValue("lessonOrder", "1");
    }

    const modal = document.getElementById("lessonModal");
    if (modal) {
        modal.classList.add("show");
        modal.style.display = "flex";
    }

    await loadLessons(id);
}

function closeLessonModal() {
    hideModal("lessonModal");
}

async function loadLessons(courseId) {
    const body = document.getElementById("lessonsTableBody");
    if (!body) return;

    body.innerHTML = `<tr><td colspan="5" class="empty-row">جاري تحميل المحاضرات...</td></tr>`;

    try {
        const data = await apiRequest(
            `${API}/courses/${encodeURIComponent(courseId)}/lessons`
        );

        const lessons = Array.isArray(data.lessons) ? data.lessons : [];

        if (!lessons.length) {
            body.innerHTML = `<tr><td colspan="5" class="empty-row">لا توجد محاضرات لهذه الدورة حاليًا</td></tr>`;
            return;
        }

        body.innerHTML = lessons.map(lesson => {
            const videoUrl = String(lesson.video_url || lesson.videoUrl || "");
            const safeUrl = /^https?:\/\//i.test(videoUrl) ? videoUrl : "";

            return `
                <tr>
                    <td>${escapeHTML(lesson.id)}</td>
                    <td>${escapeHTML(lesson.title || "-")}</td>
                    <td>${escapeHTML(lesson.duration || "-")}</td>
                    <td>${safeUrl
                        ? `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">فتح الفيديو</a>`
                        : "-"
                    }</td>
                    <td>
                        <button type="button" class="table-action delete-action"
                            onclick="deleteLesson(${Number(lesson.id)}, ${Number(courseId)})">حذف</button>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (error) {
        console.error("Load lessons error:", error);
        body.innerHTML = `<tr><td colspan="5" class="empty-row">تعذر تحميل المحاضرات: ${escapeHTML(error.message)}</td></tr>`;
        showToast(error.message || "تعذر تحميل المحاضرات.", "error");
    }
}

async function saveLesson(event) {
    event?.preventDefault();

    let courseId = Number(getValue("lessonCourse"));
    if (!Number.isInteger(courseId) || courseId <= 0) courseId = Number(selectedCourseId);

    const title = getValue("lessonTitle");
    const videoUrl = getValue("lessonUrl");
    const description = getValue("lessonDescription");
    const duration = getValue("lessonDuration") || "0";
    const orderValue = getValue("lessonOrder");
    const lessonOrder = orderValue ? Number(orderValue) : 1;

    if (!Number.isInteger(courseId) || courseId <= 0) {
        return showToast("اختر الدورة.", "error");
    }
    if (!title) return showToast("اكتب عنوان المحاضرة.", "error");
    if (!videoUrl) return showToast("ضع رابط الفيديو.", "error");
    if (!/^https?:\/\//i.test(videoUrl)) {
        return showToast("رابط الفيديو يجب أن يبدأ بـ http:// أو https://", "error");
    }
    if (!Number.isFinite(lessonOrder) || lessonOrder < 1) {
        return showToast("ترتيب المحاضرة يجب أن يبدأ من 1.", "error");
    }

    const button = document.querySelector("#lessonForm button[type='submit']");
    if (button) button.disabled = true;

    try {
        const data = await apiRequest(`${API}/lessons`, {
            method: "POST",
            body: JSON.stringify({
                course_id: courseId,
                title,
                description,
                video_url: videoUrl,
                duration,
                lesson_order: lessonOrder
            })
        });

        selectedCourseId = courseId;
        showToast(data.message || "تمت إضافة المحاضرة بنجاح.", "success");

        setValue("lessonTitle", "");
        setValue("lessonUrl", "");
        setValue("lessonDescription", "");
        setValue("lessonDuration", "");
        setValue("lessonOrder", "1");

        await loadLessons(courseId);
        await loadDashboard();
    } catch (error) {
        console.error("Save lesson error:", error);
        showToast(error.message || "تعذر إضافة المحاضرة.", "error");
    } finally {
        if (button) button.disabled = false;
    }
}

async function deleteLesson(lessonId, courseId = selectedCourseId) {
    if (!confirm("هل أنت متأكد من حذف هذه المحاضرة؟")) return;

    try {
        await apiRequest(`${API}/lessons/${encodeURIComponent(lessonId)}`, {
            method: "DELETE"
        });

        showToast("تم حذف المحاضرة بنجاح.", "success");

        if (courseId) {
            selectedCourseId = Number(courseId);
            await loadLessons(Number(courseId));
        }

        await loadDashboard();
    } catch (error) {
        console.error("Delete lesson error:", error);
        showToast(error.message || "تعذر حذف المحاضرة.", "error");
    }
}

// ============================================================
// SPECIALTIES
// ============================================================

async function loadSpecialties() {
    const body = document.getElementById("specialtiesTableBody");

    try {
        const data = await apiRequest(`${API}/specialties`);
        adminSpecialties = Array.isArray(data.specialties) ? data.specialties : [];

        renderSpecialties();
        populateSpecialtySelect();
    } catch (error) {
        console.error("Specialties error:", error);

        if (body) {
            body.innerHTML = `<tr><td colspan="5" class="empty-row">تعذر تحميل التخصصات: ${escapeHTML(error.message)}</td></tr>`;
        }
    }
}

function renderSpecialties() {
    const body = document.getElementById("specialtiesTableBody");
    if (!body) return;

    if (!adminSpecialties.length) {
        body.innerHTML = `<tr><td colspan="5" class="empty-row">لا توجد تخصصات مسجلة في قاعدة البيانات</td></tr>`;
        return;
    }

    body.innerHTML = adminSpecialties.map(specialty => `
        <tr>
            <td>${escapeHTML(specialty.id)}</td>
            <td>${escapeHTML(specialty.icon || "📚")}</td>
            <td>${escapeHTML(specialty.name || "-")}</td>
            <td>${escapeHTML(specialty.description || "-")}</td>
            <td>—</td>
        </tr>
    `).join("");
}

function openSpecialtyModal() {
    const form = document.getElementById("specialtyForm");
    const modal = document.getElementById("specialtyModal");

    if (!form || !modal) {
        return showToast("لم يتم العثور على نموذج التخصص.", "error");
    }

    form.reset();
    setValue("specialtyIcon", "📚");

    modal.classList.add("show");
    modal.style.display = "flex";
}

function closeSpecialtyModal() {
    hideModal("specialtyModal");
}

async function saveSpecialty(event) {
    event?.preventDefault();

    const name = getValue("specialtyName");
    const icon = getValue("specialtyIcon") || "📚";
    const description = getValue("specialtyDescription");

    if (!name || !description) {
        return showToast("أدخل اسم التخصص ووصفه.", "error");
    }

    const button = document.querySelector("#specialtyForm button[type='submit']");
    if (button) button.disabled = true;

    try {
        const data = await apiRequest(`${API}/specialties`, {
            method: "POST",
            body: JSON.stringify({ name, icon, description })
        });

        showToast(data.message || "تمت إضافة التخصص بنجاح.", "success");
        closeSpecialtyModal();

        await loadSpecialties();
        await loadCourses();
    } catch (error) {
        console.error("Save specialty error:", error);
        showToast(error.message || "تعذرت إضافة التخصص.", "error");
    } finally {
        if (button) button.disabled = false;
    }
}

// ============================================================
// DYNAMIC COURSE CATEGORIES
// ============================================================

function populateSpecialtySelect() {
    const select = document.getElementById("courseCategory");
    if (!select) return;

    const currentValue = select.value;

    const defaults = [
        { name: "برمجة", icon: "💻" },
        { name: "إنجليزي", icon: "🇬🇧" },
        { name: "تصميم", icon: "🎨" },
        { name: "الأمن السيبراني", icon: "🛡️" }
    ];

    const names = new Set();
    const options = [];

    [...defaults, ...adminSpecialties].forEach(item => {
        const name = String(item.name || "").trim();
        if (!name || names.has(name)) return;

        names.add(name);
        options.push({ name, icon: item.icon || "📚" });
    });

    if (currentValue && !names.has(currentValue)) {
        options.push({ name: currentValue, icon: "📚" });
    }

    select.innerHTML = `<option value="">اختر التصنيف</option>`;

    options.forEach(item => {
        const option = document.createElement("option");
        option.value = item.name;
        option.textContent = `${item.icon} ${item.name}`;
        select.appendChild(option);
    });

    if (currentValue) select.value = currentValue;
}

// ============================================================
// NAVIGATION
// ============================================================

function showSection(sectionName, clickedButton = null) {
    const sectionMap = {
        dashboard: "dashboardSection",
        courses: "coursesSection",
        lessons: "lessonsSection",
        users: "usersSection",
        certificates: "certificatesSection",
        specialties: "specialtiesSection"
    };

    const titleMap = {
        dashboard: "لوحة التحكم",
        courses: "الدورات",
        lessons: "المحاضرات",
        users: "المستخدمون",
        certificates: "الشهادات",
        specialties: "التخصصات"
    };

    document.querySelectorAll(".page-section").forEach(section => {
        section.classList.remove("active");
        section.style.display = "none";
    });

    const target = document.getElementById(sectionMap[sectionName]);
    if (target) {
        target.classList.add("active");
        target.style.display = "block";
    }

    document.querySelectorAll(".menu-item").forEach(item => item.classList.remove("active"));
    if (clickedButton) clickedButton.classList.add("active");

    setText(["pageTitle"], titleMap[sectionName] || "لوحة التحكم");

    if (sectionName === "courses") loadCourses();
    if (sectionName === "lessons") populateCourseSelects();
    if (sectionName === "users") loadUsers();
    if (sectionName === "certificates") loadCertificates();
    if (sectionName === "dashboard") loadDashboard();
    if (sectionName === "specialties") loadSpecialties();
}

function showSectionByName(sectionName) {
    let button = null;

    document.querySelectorAll(".menu-item").forEach(item => {
        if ((item.getAttribute("onclick") || "").includes(`showSection('${sectionName}'`)) {
            button = item;
        }
    });

    showSection(sectionName, button);
}

// ============================================================
// USERS
// ============================================================

async function loadUsers() {
    const body = document.getElementById("usersTableBody");
    if (!body) return;

    try {
        const data = await apiRequest(`${API}/users`);
        const users = Array.isArray(data.users) ? data.users : [];

        if (!users.length) {
            body.innerHTML = `<tr><td colspan="4" class="empty-row">لا يوجد مستخدمون حاليًا</td></tr>`;
            return;
        }

        body.innerHTML = users.map(user => `
            <tr>
                <td>${escapeHTML(user.id)}</td>
                <td>${escapeHTML(user.name || "-")}</td>
                <td>${escapeHTML(user.email || "-")}</td>
                <td>${formatDate(user.created_at)}</td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("Users error:", error);
        body.innerHTML = `<tr><td colspan="4" class="empty-row">تعذر تحميل المستخدمين: ${escapeHTML(error.message)}</td></tr>`;
    }
}

async function loadCertificates() {
    const body = document.getElementById("certificatesTableBody");
    if (!body) return;

    try {
        const data = await apiRequest(`${API}/certificates`);
        const certificates = Array.isArray(data.certificates) ? data.certificates : [];

        if (!certificates.length) {
            body.innerHTML = `<tr><td colspan="4" class="empty-row">لا توجد شهادات حاليًا</td></tr>`;
            return;
        }

        body.innerHTML = certificates.map(cert => `
            <tr>
                <td>${escapeHTML(cert.certificate_id || "-")}</td>
                <td>${escapeHTML(cert.user_name || "-")}</td>
                <td>${escapeHTML(cert.course_title || "-")}</td>
                <td>${formatDate(cert.issued_at)}</td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("Certificates error:", error);
        body.innerHTML = `<tr><td colspan="4" class="empty-row">تعذر تحميل الشهادات: ${escapeHTML(error.message)}</td></tr>`;
    }
}

// ============================================================
// LOGOUT AND HELPERS
// ============================================================

async function adminLogout() {
    try {
        await apiRequest(`${API}/logout`, { method: "POST" });
    } catch (error) {
        console.error("Logout error:", error);
    }

    [
        "zawamAdminLoggedIn",
        "zawamAdminToken",
        "zawamAdminName",
        "zawamAdminEmail",
        "zawamAdminId"
    ].forEach(key => localStorage.removeItem(key));

    window.location.href = "/admin-login.html";
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("show");
    modal.style.display = "none";
}

document.addEventListener("click", event => {
    ["courseModal", "lessonModal", "specialtyModal"].forEach(id => {
        const modal = document.getElementById(id);
        if (modal && event.target === modal) hideModal(id);
    });
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        ["courseModal", "lessonModal", "specialtyModal"].forEach(hideModal);
    }
});

function getValue(id) {
    return String(document.getElementById(id)?.value || "").trim();
}

function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? "";
}

function setText(ids, value) {
    ids.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = value ?? "";
    });
}

function escapeHTML(value) {
    if (value === null || value === undefined) return "";

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
    return escapeHTML(value);
}

function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHTML(value);

    return date.toLocaleDateString("ar-RW", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

function showToast(message, type = "success") {
    let toast = document.getElementById("toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `toast ${type} show`;

    clearTimeout(window.zawamToastTimer);
    window.zawamToastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

// ============================================================
// GLOBAL FUNCTIONS
// ============================================================

Object.assign(window, {
    loadDashboard,
    loadCourses,
    loadUsers,
    loadCertificates,
    filterCourses,
    openCourseModal,
    closeCourseModal,
    editCourse,
    saveCourse,
    deleteCourse,
    populateCourseSelects,
    openLessonModal,
    closeLessonModal,
    loadLessons,
    loadAdminLessons,
    saveLesson,
    addLesson: saveLesson,
    deleteLesson,
    loadSpecialties,
    renderSpecialties,
    openSpecialtyModal,
    closeSpecialtyModal,
    saveSpecialty,
    populateSpecialtySelect,
    showSection,
    showSectionByName,
    adminLogout
});
