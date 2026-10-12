
// ============================================================
// ZAWAM ADMIN DASHBOARD
// ============================================================

const API = "/api/admin";

let selectedCourseId = null;
let adminCourses = [];
let adminSpecialties = [];

document.addEventListener("DOMContentLoaded", initializeAdmin);

// ============================================================
// INITIALIZE
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
    }
}

// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(url, options = {}) {
    const token = localStorage.getItem("zawamAdminToken");

    const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

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
        data = {
            message: text || "استجابة غير صالحة من الخادم."
        };
    }

    if (response.status === 401) {
        localStorage.removeItem("zawamAdminLoggedIn");
        localStorage.removeItem("zawamAdminToken");
        localStorage.removeItem("zawamAdminName");
        localStorage.removeItem("zawamAdminEmail");
        localStorage.removeItem("zawamAdminId");

        if (!window.location.pathname.includes("admin-login.html")) {
            window.location.href = "/admin-login.html";
        }

        throw new Error(data.message || "انتهت جلسة الأدمن. سجّل الدخول مجددًا.");
    }

    if (!response.ok || data.success === false) {
        throw new Error(
            data.message ||
            data.error ||
            `حدث خطأ (${response.status})`
        );
    }

    return data;
}

// ============================================================
// ADMIN INFO
// ============================================================

async function loadAdminInfo() {
    const data = await apiRequest(`${API}/me`);
    const admin = data.admin || {};

    const name = admin.name || "مدير المنصة";
    const email = admin.email || "";

    localStorage.setItem("zawamAdminLoggedIn", "true");
    localStorage.setItem("zawamAdminName", name);
    localStorage.setItem("zawamAdminEmail", email);

    setText(["adminName", "admin-name", "profileName"], name);
    setText(["adminEmail", "admin-email", "profileEmail"], email);
}

// ============================================================
// DASHBOARD
// ============================================================

async function loadDashboard() {
    try {
        const data = await apiRequest(`${API}/dashboard`);
        const stats = data.stats || {};

        setText(
            ["coursesCount", "totalCourses", "total-courses"],
            stats.totalCourses ?? stats.total_courses ?? 0
        );

        setText(
            ["lessonsCount", "totalLessons", "total-lessons"],
            stats.totalLessons ?? stats.total_lessons ?? 0
        );

        setText(
            ["usersCount", "totalUsers", "total-users"],
            stats.totalUsers ?? stats.total_users ?? 0
        );

        setText(
            ["certificatesCount", "totalCertificates", "total-certificates"],
            stats.totalCertificates ?? stats.total_certificates ?? 0
        );
    } catch (error) {
        console.error("Dashboard error:", error);
        showToast(error.message || "تعذر تحميل لوحة التحكم.", "error");
    }
}

// ============================================================
// COURSES
// ============================================================

async function loadCourses() {
    const tableBody = document.getElementById("coursesTableBody");

    try {
        const data = await apiRequest(`${API}/courses`);

        adminCourses = Array.isArray(data.courses) ? data.courses : [];
        window.zawamCourses = adminCourses;

        renderCourses(adminCourses);
        populateCourseSelects();
        populateSpecialtySelect();
    } catch (error) {
        console.error("Courses error:", error);

        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-row">
                        تعذر تحميل الدورات: ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;
        }

        showToast(error.message || "تعذر تحميل الدورات.", "error");
    }
}

// ============================================================
// RENDER COURSES
// ============================================================

function renderCourses(courses) {
    const tableBody = document.getElementById("coursesTableBody");
    if (!tableBody) return;

    if (!courses.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-row">
                    لا توجد دورات حاليًا
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = courses.map(course => `
        <tr>
            <td>${escapeHTML(course.id)}</td>
            <td>${escapeHTML(course.title || "بدون عنوان")}</td>
            <td>${escapeHTML(course.category || "غير محدد")}</td>
            <td>${escapeHTML(course.instructor || "غير محدد")}</td>
            <td>${escapeHTML(course.duration || "-")}</td>
            <td>
                <button
                    type="button"
                    class="table-action edit-action"
                    onclick="openLessonModal(${Number(course.id)})">
                    الدروس
                </button>

                <button
                    type="button"
                    class="table-action edit-action"
                    onclick="editCourse(${Number(course.id)})">
                    تعديل
                </button>

                <button
                    type="button"
                    class="table-action delete-action"
                    onclick="deleteCourse(${Number(course.id)})">
                    حذف
                </button>
            </td>
        </tr>
    `).join("");
}

// ============================================================
// COURSE SEARCH
// ============================================================

function filterCourses() {
    const input = document.getElementById("courseSearch");
    const search = String(input?.value || "").trim().toLowerCase();

    if (!search) {
        renderCourses(adminCourses);
        return;
    }

    const filtered = adminCourses.filter(course => {
        const text = [
            course.id,
            course.title,
            course.category,
            course.instructor,
            course.duration
        ].join(" ").toLowerCase();

        return text.includes(search);
    });

    renderCourses(filtered);
}

// ============================================================
// COURSE MODAL
// ============================================================

function openCourseModal(course = null) {
    const modal = document.getElementById("courseModal");
    if (!modal) return;

    const form = document.getElementById("courseForm");
    if (form) form.reset();

    populateSpecialtySelect();

    setValue("courseId", course?.id || "");
    setValue("courseTitle", course?.title || "");
    setValue("courseDescription", course?.description || "");
    setValue("courseInstructor", course?.instructor || "");
    setValue("courseDuration", course?.duration || "");

    const categorySelect = document.getElementById("courseCategory");

    if (categorySelect) {
        const category = String(course?.category || "").trim();

        if (
            category &&
            !Array.from(categorySelect.options).some(
                option => option.value === category
            )
        ) {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        }

        categorySelect.value = category;
    }

    modal.classList.add("show");
    modal.style.display = "flex";
}

function closeCourseModal() {
    const modal = document.getElementById("courseModal");
    if (!modal) return;

    modal.classList.remove("show");
    modal.style.display = "none";
}

function editCourse(id) {
    const course = adminCourses.find(
        item => Number(item.id) === Number(id)
    );

    if (!course) {
        showToast("لم يتم العثور على الدورة.", "error");
        return;
    }

    openCourseModal(course);
}

// ============================================================
// SAVE COURSE
// ============================================================

async function saveCourse(event) {
    if (event) event.preventDefault();

    const id = getValue("courseId");
    const title = getValue("courseTitle");
    const description = getValue("courseDescription");
    const category = getValue("courseCategory");
    const instructor = getValue("courseInstructor");
    const duration = getValue("courseDuration");

    if (!title) {
        showToast("اكتب اسم الدورة.", "error");
        return;
    }

    if (!category) {
        showToast("اختر تصنيف الدورة.", "error");
        return;
    }

    const courseData = {
        title,
        description,
        category,
        instructor,
        duration
    };

    const submitButton = document.querySelector(
        "#courseForm button[type='submit']"
    );

    if (submitButton) submitButton.disabled = true;

    try {
        if (id) {
            await apiRequest(`${API}/courses/${encodeURIComponent(id)}`, {
                method: "PUT",
                body: JSON.stringify(courseData)
            });

            showToast("تم تعديل الدورة بنجاح.", "success");
        } else {
            await apiRequest(`${API}/courses`, {
                method: "POST",
                body: JSON.stringify(courseData)
            });

            showToast("تمت إضافة الدورة بنجاح.", "success");
        }

        closeCourseModal();
        await loadCourses();
        await loadDashboard();
    } catch (error) {
        console.error("Save course error:", error);
        showToast(error.message || "تعذر حفظ الدورة.", "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

// ============================================================
// DELETE COURSE
// ============================================================

async function deleteCourse(id) {
    const confirmed = confirm(
        "هل أنت متأكد من حذف هذه الدورة؟\n\nسيتم حذف البيانات المرتبطة بها حسب إعدادات قاعدة البيانات."
    );

    if (!confirmed) return;

    try {
        await apiRequest(`${API}/courses/${encodeURIComponent(id)}`, {
            method: "DELETE"
        });

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
    const selects = [
        document.getElementById("lessonCourseSelect"),
        document.getElementById("lessonCourse")
    ].filter(Boolean);

    selects.forEach(select => {
        const current = select.value || String(selectedCourseId || "");

        select.innerHTML = `<option value="">اختر الدورة</option>`;

        adminCourses.forEach(course => {
            const option = document.createElement("option");
            option.value = course.id;
            option.textContent = course.title || `الدورة ${course.id}`;
            select.appendChild(option);
        });

        if (current && adminCourses.some(
            course => String(course.id) === String(current)
        )) {
            select.value = current;
        }
    });
}

// ============================================================
// LESSONS SECTION
// ============================================================

async function loadAdminLessons() {
    const select = document.getElementById("lessonCourseSelect");
    if (!select) return;

    const courseId = Number(select.value);

    if (!Number.isInteger(courseId) || courseId <= 0) {
        const body = document.getElementById("lessonsTableBody");

        if (body) {
            body.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-row">
                        اختر دورة لعرض محاضراتها
                    </td>
                </tr>
            `;
        }
        return;
    }

    selectedCourseId = courseId;
    await loadLessons(courseId);
}

// ============================================================
// LESSON MODAL
// ============================================================

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
        showToast("اختر دورة أولًا لإضافة محاضرة.", "error");
        return;
    }

    selectedCourseId = id;
    populateCourseSelects();
    setValue("lessonCourse", id);

    const select = document.getElementById("lessonCourseSelect");
    if (select) select.value = String(id);

    const course = adminCourses.find(
        item => Number(item.id) === id
    );

    const titleElement = document.getElementById("lessonCourseTitle");

    if (titleElement) {
        titleElement.textContent = course?.title || `الدورة رقم ${id}`;
    }

    const form = document.getElementById("lessonForm");
    if (form) form.reset();

    setValue("lessonCourse", id);

    const modal = document.getElementById("lessonModal");

    if (modal) {
        modal.classList.add("show");
        modal.style.display = "flex";
    }

    await loadLessons(id);
}

function closeLessonModal() {
    const modal = document.getElementById("lessonModal");
    if (!modal) return;

    modal.classList.remove("show");
    modal.style.display = "none";
}

// ============================================================
// LOAD LESSONS
// ============================================================

async function loadLessons(courseId) {
    const tableBody = document.getElementById("lessonsTableBody");
    if (!tableBody) return;

    try {
        const data = await apiRequest(
            `${API}/courses/${encodeURIComponent(courseId)}/lessons`
        );

        const lessons = Array.isArray(data.lessons) ? data.lessons : [];

        if (!lessons.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-row">
                        لا توجد محاضرات لهذه الدورة حاليًا
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = lessons.map(lesson => {
            const videoUrl = lesson.video_url || "";

            return `
                <tr>
                    <td>${escapeHTML(lesson.id)}</td>
                    <td>${escapeHTML(lesson.title || "-")}</td>
                    <td>${escapeHTML(lesson.duration || "-")}</td>
                    <td>
                        ${
                            videoUrl
                                ? `<a href="${escapeAttribute(videoUrl)}"
                                      target="_blank"
                                      rel="noopener noreferrer">فتح الفيديو</a>`
                                : "-"
                        }
                    </td>
                    <td>
                        <button
                            type="button"
                            class="table-action delete-action"
                            onclick="deleteLesson(${Number(lesson.id)}, ${Number(courseId)})">
                            حذف
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (error) {
        console.error("Load lessons error:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-row">
                    تعذر تحميل المحاضرات: ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        showToast(error.message || "تعذر تحميل المحاضرات.", "error");
    }
}

// ============================================================
// SAVE LESSON
// ============================================================

async function saveLesson(event) {
    if (event) event.preventDefault();

    let courseId = Number(getValue("lessonCourse"));

    if (!Number.isInteger(courseId) || courseId <= 0) {
        courseId = Number(selectedCourseId);
    }

    const title = getValue("lessonTitle");
    const videoUrl = getValue("lessonUrl");
    const description = getValue("lessonDescription");
    const duration = getValue("lessonDuration") || "0";
    const lessonOrderValue = getValue("lessonOrder");

    if (!Number.isInteger(courseId) || courseId <= 0) {
        showToast("اختر الدورة.", "error");
        return;
    }

    if (!title) {
        showToast("اكتب عنوان المحاضرة.", "error");
        return;
    }

    if (!videoUrl) {
        showToast("ضع رابط الفيديو.", "error");
        return;
    }

    const lessonOrder = lessonOrderValue
        ? Number(lessonOrderValue)
        : 1;

    if (!Number.isFinite(lessonOrder) || lessonOrder < 1) {
        showToast("ترتيب المحاضرة يجب أن يكون رقمًا يبدأ من 1.", "error");
        return;
    }

    const submitButton = document.querySelector(
        "#lessonForm button[type='submit']"
    );

    if (submitButton) submitButton.disabled = true;

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
        setValue("lessonOrder", "");

        await loadLessons(courseId);
        await loadDashboard();
    } catch (error) {
        console.error("Save lesson error:", error);
        showToast(error.message || "تعذر إضافة المحاضرة.", "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

// ============================================================
// DELETE LESSON
// ============================================================

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
// USERS
// ============================================================

async function loadUsers() {
    const tableBody = document.getElementById("usersTableBody");
    if (!tableBody) return;

    try {
        const data = await apiRequest(`${API}/users`);
        const users = Array.isArray(data.users) ? data.users : [];

        if (!users.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-row">
                        لا يوجد مستخدمون حاليًا
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = users.map(user => `
            <tr>
                <td>${escapeHTML(user.id)}</td>
                <td>${escapeHTML(user.name || "-")}</td>
                <td>${escapeHTML(user.email || "-")}</td>
                <td>${formatDate(user.created_at)}</td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("Users error:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-row">
                    تعذر تحميل المستخدمين: ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        showToast(error.message || "تعذر تحميل المستخدمين.", "error");
    }
}

// ============================================================
// CERTIFICATES
// ============================================================

async function loadCertificates() {
    const tableBody = document.getElementById("certificatesTableBody");
    if (!tableBody) return;

    try {
        const data = await apiRequest(`${API}/certificates`);
        const certificates = Array.isArray(data.certificates)
            ? data.certificates
            : [];

        if (!certificates.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-row">
                        لا توجد شهادات حاليًا
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = certificates.map(cert => `
            <tr>
                <td>${escapeHTML(cert.certificate_id || "-")}</td>
                <td>${escapeHTML(cert.user_name || "-")}</td>
                <td>${escapeHTML(cert.course_title || "-")}</td>
                <td>${formatDate(cert.issued_at)}</td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("Certificates error:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-row">
                    تعذر تحميل الشهادات: ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        showToast(error.message || "تعذر تحميل الشهادات.", "error");
    }
}

// ============================================================
// SPECIALTIES
// ============================================================

async function loadSpecialties() {
    const tableBody = document.getElementById("specialtiesTableBody");

    try {
        const data = await apiRequest(`${API}/specialties`);

        adminSpecialties = Array.isArray(data.specialties)
            ? data.specialties
            : [];

        renderSpecialties();
        populateSpecialtySelect();
    } catch (error) {
        console.error("Specialties error:", error);

        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-row">
                        تعذر تحميل التخصصات: ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;
        }

        populateSpecialtySelect();
    }
}

function renderSpecialties() {
    const tableBody = document.getElementById("specialtiesTableBody");
    if (!tableBody) return;

    if (!adminSpecialties.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-row">
                    لا توجد تخصصات مسجلة في قاعدة البيانات
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = adminSpecialties.map(specialty => `
        <tr>
            <td>${escapeHTML(specialty.id)}</td>
            <td>${escapeHTML(specialty.icon || "📚")}</td>
            <td>${escapeHTML(specialty.name)}</td>
            <td>${escapeHTML(specialty.description || "-")}</td>
            <td>—</td>
        </tr>
    `).join("");
}

function openSpecialtyModal() {
    const form = document.getElementById("specialtyForm");
    const modal = document.getElementById("specialtyModal");

    if (!form || !modal) {
        showToast("لم يتم العثور على نموذج إضافة التخصص في الصفحة.", "error");
        return;
    }

    form.reset();
    setValue("specialtyIcon", "📚");

    modal.classList.add("show");
    modal.style.display = "flex";
}

function closeSpecialtyModal() {
    const modal = document.getElementById("specialtyModal");
    if (!modal) return;

    modal.classList.remove("show");
    modal.style.display = "none";
}

async function saveSpecialty(event) {
    if (event) event.preventDefault();

    const name = getValue("specialtyName");
    const icon = getValue("specialtyIcon") || "📚";
    const description = getValue("specialtyDescription");

    if (!name || !description) {
        showToast("أدخل اسم التخصص ووصفه.", "error");
        return;
    }

    const submitButton = document.querySelector(
        "#specialtyForm button[type='submit']"
    );

    if (submitButton) submitButton.disabled = true;

    try {
        const data = await apiRequest(`${API}/specialties`, {
            method: "POST",
            body: JSON.stringify({
                name,
                icon,
                description
            })
        });

        showToast(data.message || "تمت إضافة التخصص بنجاح.", "success");
        closeSpecialtyModal();

        await loadSpecialties();
        await loadCourses();
    } catch (error) {
        console.error("Save specialty error:", error);
        showToast(error.message || "تعذرت إضافة التخصص.", "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

// ============================================================
// DYNAMIC COURSE CATEGORY OPTIONS
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
        options.push({
            name,
            icon: item.icon || "📚"
        });
    });

    // المحافظة على تصنيف الدورات القديمة.
    if (currentValue && !names.has(currentValue)) {
        options.push({
            name: currentValue,
            icon: "📚"
        });
    }

    select.innerHTML = `<option value="">اختر التصنيف</option>`;

    options.forEach(item => {
        const option = document.createElement("option");
        option.value = item.name;
        option.textContent = `${item.icon} ${item.name}`;
        select.appendChild(option);
    });

    if (currentValue) {
        select.value = currentValue;
    }
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

    const targetId = sectionMap[sectionName] || sectionName;

    document.querySelectorAll(".page-section").forEach(section => {
        section.classList.remove("active");
        section.style.display = "none";
    });

    const target = document.getElementById(targetId);

    if (target) {
        target.classList.add("active");
        target.style.display = "block";
    }

    document.querySelectorAll(".menu-item").forEach(item => {
        item.classList.remove("active");
    });

    if (clickedButton) {
        clickedButton.classList.add("active");
    }

    const pageTitle = document.getElementById("pageTitle");

    if (pageTitle) {
        pageTitle.textContent = titleMap[sectionName] || "لوحة التحكم";
    }

    if (sectionName === "courses") loadCourses();
    if (sectionName === "lessons") populateCourseSelects();
    if (sectionName === "users") loadUsers();
    if (sectionName === "certificates") loadCertificates();
    if (sectionName === "dashboard") loadDashboard();
    if (sectionName === "specialties") loadSpecialties();
}

function showSectionByName(sectionName) {
    const sectionMap = {
        dashboard: "dashboardSection",
        courses: "coursesSection",
        lessons: "lessonsSection",
        users: "usersSection",
        certificates: "certificatesSection",
        specialties: "specialtiesSection"
    };

    const targetId = sectionMap[sectionName];
    const target = targetId
        ? document.getElementById(targetId)
        : null;

    let button = null;

    document.querySelectorAll(".menu-item").forEach(item => {
        const onclick = item.getAttribute("onclick") || "";

        if (onclick.includes(`showSection('${sectionName}'`)) {
            button = item;
        }
    });

    showSection(sectionName, button);

    if (target) {
        target.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

// ============================================================
// LOGOUT
// ============================================================

async function adminLogout() {
    try {
        await apiRequest(`${API}/logout`, {
            method: "POST"
        });
    } catch (error) {
        console.error("Logout error:", error);
    }

    localStorage.removeItem("zawamAdminLoggedIn");
    localStorage.removeItem("zawamAdminToken");
    localStorage.removeItem("zawamAdminName");
    localStorage.removeItem("zawamAdminEmail");
    localStorage.removeItem("zawamAdminId");

    window.location.href = "/admin-login.html";
}

// ============================================================
// CLOSE MODALS
// ============================================================

document.addEventListener("click", event => {
    const courseModal = document.getElementById("courseModal");
    const lessonModal = document.getElementById("lessonModal");
    const specialtyModal = document.getElementById("specialtyModal");

    if (courseModal && event.target === courseModal) closeCourseModal();
    if (lessonModal && event.target === lessonModal) closeLessonModal();
    if (specialtyModal && event.target === specialtyModal) closeSpecialtyModal();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeCourseModal();
        closeLessonModal();
        closeSpecialtyModal();
    }
});

// ============================================================
// HELPERS
// ============================================================

function getValue(id) {
    const element = document.getElementById(id);

    if (!element) return "";

    return String(element.value || "").trim();
}

function setValue(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.value = value ?? "";
    }
}

function setText(ids, value) {
    ids.forEach(id => {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value ?? "";
        }
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

    if (Number.isNaN(date.getTime())) {
        return escapeHTML(value);
    }

    return date.toLocaleDateString("ar-RW", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

// ============================================================
// TOAST
// ============================================================

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

    window.zawamToastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

// ============================================================
// GLOBAL FUNCTIONS
// ============================================================

window.loadDashboard = loadDashboard;
window.loadCourses = loadCourses;
window.loadUsers = loadUsers;
window.loadCertificates = loadCertificates;

window.filterCourses = filterCourses;
window.openCourseModal = openCourseModal;
window.closeCourseModal = closeCourseModal;
window.editCourse = editCourse;
window.saveCourse = saveCourse;
window.deleteCourse = deleteCourse;

window.openLessonModal = openLessonModal;
window.closeLessonModal = closeLessonModal;
window.loadLessons = loadLessons;
window.loadAdminLessons = loadAdminLessons;
window.saveLesson = saveLesson;
window.addLesson = saveLesson;
window.deleteLesson = deleteLesson;

window.loadSpecialties = loadSpecialties;
window.renderSpecialties = renderSpecialties;
window.openSpecialtyModal = openSpecialtyModal;
window.closeSpecialtyModal = closeSpecialtyModal;
window.saveSpecialty = saveSpecialty;
window.populateSpecialtySelect = populateSpecialtySelect;

window.showSection = showSection;
window.showSectionByName = showSectionByName;
window.adminLogout = adminLogout;
