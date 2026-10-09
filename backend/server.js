const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const puppeteer = require("puppeteer");

const db = require("./db");
const adminRoutes = require("./admin-routes");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Repair Arabic text that arrives decoded as CP437 instead of UTF-8.
// Normal UTF-8 Arabic strings are returned unchanged.
const CP437_EXTENDED = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
const CP437_MARKERS = /[╪╫╤╥╙╘╒╓╞╟╚╔╩╦╠═╬╧╨╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼┤┘┌█▄▌▐▀░▒▓]/;

function repairMojibakeString(value) {
    if (typeof value !== "string" || !CP437_MARKERS.test(value)) {
        return value;
    }

    const bytes = [];

    for (const character of value) {
        const code = character.codePointAt(0);

        if (code <= 0x7F) {
            bytes.push(code);
            continue;
        }

        const index = CP437_EXTENDED.indexOf(character);

        if (index === -1) {
            return value;
        }

        bytes.push(index + 128);
    }

    const buffer = Buffer.from(bytes);
    const decoded = buffer.toString("utf8");

    // Only accept a conversion when the bytes form valid UTF-8 exactly.
    if (
        !Buffer.from(decoded, "utf8").equals(buffer) ||
        decoded.includes("\uFFFD")
    ) {
        return value;
    }

    return decoded;
}

function repairMojibake(value) {
    if (value instanceof Date || Buffer.isBuffer(value)) {
        return value;
    }

    if (typeof value === "string") {
        return repairMojibakeString(value);
    }

    if (Array.isArray(value)) {
        return value.map(repairMojibake);
    }

    if (value && typeof value === "object") {
        const repaired = {};

        for (const [key, item] of Object.entries(value)) {
            repaired[key] = repairMojibake(item);
        }

        return repaired;
    }

    return value;
}

// Apply the repair only to JSON response values; API routes remain unchanged.
app.use((req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (body) => originalJson(repairMojibake(body));

    next();
});

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());
app.use(express.json());

app.use("/api/admin", adminRoutes);

app.use(
    express.static(
        path.resolve(__dirname, "..")
    )
);

// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {
    res.send("ZAWAM API is running 🚀");
});

// ============================================================
// HTML PAGES
// ============================================================

app.get("/login.html", (req, res) => {
    res.sendFile(
        path.resolve(__dirname, "..", "login.html")
    );
});

app.get("/register.html", (req, res) => {
    res.sendFile(
        path.resolve(__dirname, "..", "register.html")
    );
});

app.get("/profile.html", (req, res) => {
    res.sendFile(
        path.resolve(__dirname, "..", "profile.html")
    );
});

app.get("/admin.html", (req, res) => {
    res.sendFile(
        path.resolve(__dirname, "..", "admin.html")
    );
});

app.get("/admin-login.html", (req, res) => {
    res.sendFile(
        path.resolve(__dirname, "..", "admin-login.html")
    );
});

// ============================================================
// TEST DATABASE
// ============================================================

app.get("/api/test-db", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT 1 AS test"
        );

        res.json({
            success: true,
            message: "Database connected successfully",
            data: rows
        });
    } catch (error) {
        console.error("Database test error:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed",
            error: error.message
        });
    }
});

// ============================================================
// REGISTER
// ============================================================

app.post("/api/register", async (req, res) => {
    try {
        const {
            name,
            email,
            password
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "الرجاء إدخال جميع البيانات"
            });
        }

        if (String(password).length < 6) {
            return res.status(400).json({
                success: false,
                message:
                    "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
            });
        }

        const cleanName = String(name).trim();

        const cleanEmail = String(email)
            .trim()
            .toLowerCase();

        const [existingUsers] = await db.query(
            `
            SELECT id
            FROM users
            WHERE email = ?
            LIMIT 1
            `,
            [cleanEmail]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "البريد الإلكتروني مستخدم بالفعل"
            });
        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const [result] = await db.query(
            `
            INSERT INTO users
            (
                name,
                email,
                password
            )
            VALUES (?, ?, ?)
            `,
            [
                cleanName,
                cleanEmail,
                hashedPassword
            ]
        );

        res.status(201).json({
            success: true,
            message: "تم إنشاء الحساب بنجاح",
            user: {
                id: result.insertId,
                name: cleanName,
                email: cleanEmail
            }
        });
    } catch (error) {
        console.error("Register error:", error);

        res.status(500).json({
            success: false,
            message:
                "حدث خطأ أثناء إنشاء الحساب",
            error: error.message
        });
    }
});

// ============================================================
// LOGIN
// ============================================================

app.post("/api/login", async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message:
                    "الرجاء إدخال البريد الإلكتروني وكلمة المرور"
            });
        }

        const cleanEmail = String(email)
            .trim()
            .toLowerCase();

        const [users] = await db.query(
            `
            SELECT
                id,
                name,
                email,
                password,
                role,
                created_at
            FROM users
            WHERE email = ?
            LIMIT 1
            `,
            [cleanEmail]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message:
                    "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            });
        }

        const user = users[0];

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message:
                    "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            });
        }

        res.json({
            success: true,
            message:
                "تم تسجيل الدخول بنجاح",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            success: false,
            message:
                "حدث خطأ أثناء تسجيل الدخول",
            error: error.message
        });
    }
});
// ============================================================
// PROFILE
// ============================================================

app.get(
    "/api/profile/:userId",
    async (req, res) => {
        try {
            const userId = Number(req.params.userId);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "معرف المستخدم غير صحيح"
                });
            }

            const [users] = await db.query(
                `
                SELECT id, name, email, role, created_at
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [userId]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "المستخدم غير موجود"
                });
            }

            res.json({
                success: true,
                user: users[0]
            });
        } catch (error) {
            console.error("Profile error:", error);

            res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء تحميل الملف الشخصي",
                error: error.message
            });
        }
    }
);

// ============================================================
// DASHBOARD
// ============================================================

app.get(
    "/api/dashboard/:userId",
    async (req, res) => {
        try {
            const userId = Number(req.params.userId);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "معرف المستخدم غير صحيح"
                });
            }

            const [users] = await db.query(
                `
                SELECT id, name, email, role, created_at
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [userId]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "المستخدم غير موجود"
                });
            }

            const [enrollments] = await db.query(
                `
                SELECT
                    e.id AS enrollment_id,
                    e.user_id,
                    e.course_id,
                    e.enrolled_at,
                    c.title,
                    c.category,
                    c.instructor,
                    c.description,
                    c.duration,
                    c.image
                FROM enrollments e
                INNER JOIN courses c ON e.course_id = c.id
                WHERE e.user_id = ?
                ORDER BY e.enrolled_at DESC
                `,
                [userId]
            );

            const courses = [];

            for (const course of enrollments) {
                const [lessonRows] = await db.query(
                    `
                    SELECT COUNT(*) AS total_lessons
                    FROM lessons
                    WHERE course_id = ?
                    `,
                    [course.course_id]
                );

                const [completedRows] = await db.query(
                    `
                    SELECT COUNT(DISTINCT lesson_id) AS completed_lessons
                    FROM progress
                    WHERE user_id = ?
                      AND course_id = ?
                      AND completed = 1
                    `,
                    [userId, course.course_id]
                );

                const totalLessons =
                    Number(lessonRows[0]?.total_lessons || 0);

                const completedLessons =
                    Number(completedRows[0]?.completed_lessons || 0);

                const progress = totalLessons > 0
                    ? Math.min(
                        100,
                        Math.round(
                            (completedLessons / totalLessons) * 100
                        )
                    )
                    : 0;

                courses.push({
                    ...course,
                    total_lessons: totalLessons,
                    completed_lessons: completedLessons,
                    progress
                });
            }

            const [certificates] = await db.query(
                `
                SELECT
                    cert.id,
                    cert.certificate_id,
                    cert.user_id,
                    cert.course_id,
                    cert.issued_at,
                    c.title AS course_title
                FROM certificates cert
                INNER JOIN courses c ON cert.course_id = c.id
                WHERE cert.user_id = ?
                ORDER BY cert.issued_at DESC
                `,
                [userId]
            );

            const completedCourses = courses.filter(
                course => course.progress >= 100
            ).length;

            res.json({
                success: true,
                user: users[0],
                stats: {
                    total_courses: courses.length,
                    completed_courses: completedCourses,
                    certificates: certificates.length
                },
                courses,
                certificates
            });
        } catch (error) {
            console.error("Dashboard error:", error);

            res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء تحميل لوحة المستخدم",
                error: error.message
            });
        }
    }
);

// ============================================================
// GET ALL COURSES
// ============================================================

app.get("/api/courses", async (req, res) => {
    try {
        const [courses] = await db.query(
            `
            SELECT
                id,
                title,
                description,
                category,
                instructor,
                duration,
                image,
                created_at
            FROM courses
            ORDER BY id DESC
            `
        );

        res.json({
            success: true,
            courses
        });
    } catch (error) {
        console.error("Courses error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل الدورات",
            error: error.message
        });
    }
});

// ============================================================
// GET COURSE LESSONS
// ============================================================

app.get("/api/lessons/:courseId", async (req, res) => {
    try {
        const courseId = Number(req.params.courseId);

        if (!Number.isInteger(courseId) || courseId <= 0) {
            return res.status(400).json({
                success: false,
                message: "معرف الدورة غير صحيح"
            });
        }

        const [lessons] = await db.query(
            `
            SELECT
                id,
                course_id,
                title,
                description,
                video_url,
                duration,
                lesson_order,
                created_at
            FROM lessons
            WHERE course_id = ?
            ORDER BY lesson_order ASC, id ASC
            `,
            [courseId]
        );

        res.json({
            success: true,
            lessons
        });
    } catch (error) {
        console.error("Lessons error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل المحاضرات",
            error: error.message
        });
    }
});

// ============================================================
// GET SINGLE LESSON
// ============================================================

app.get("/api/lesson/:id", async (req, res) => {
    try {
        const lessonId = Number(req.params.id);

        if (!Number.isInteger(lessonId) || lessonId <= 0) {
            return res.status(400).json({
                success: false,
                message: "معرف المحاضرة غير صحيح"
            });
        }

        const [lessons] = await db.query(
            `
            SELECT
                id,
                course_id,
                title,
                description,
                video_url,
                duration,
                lesson_order,
                created_at
            FROM lessons
            WHERE id = ?
            LIMIT 1
            `,
            [lessonId]
        );

        if (lessons.length === 0) {
            return res.status(404).json({
                success: false,
                message: "المحاضرة غير موجودة"
            });
        }

        res.json({
            success: true,
            lesson: lessons[0]
        });
    } catch (error) {
        console.error("Single lesson error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل المحاضرة",
            error: error.message
        });
    }
});

// ============================================================
// ENROLL IN COURSE
// ============================================================

app.post("/api/enroll", async (req, res) => {
    try {
        const { user_id, course_id } = req.body;

        const userId = Number(user_id);
        const courseId = Number(course_id);

        if (
            !Number.isInteger(userId) || userId <= 0 ||
            !Number.isInteger(courseId) || courseId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "بيانات التسجيل غير صحيحة"
            });
        }

        const [users] = await db.query(
            "SELECT id FROM users WHERE id = ? LIMIT 1",
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        const [courses] = await db.query(
            "SELECT id FROM courses WHERE id = ? LIMIT 1",
            [courseId]
        );

        if (courses.length === 0) {
            return res.status(404).json({
                success: false,
                message: "الدورة غير موجودة"
            });
        }

        const [existing] = await db.query(
            `
            SELECT id
            FROM enrollments
            WHERE user_id = ? AND course_id = ?
            LIMIT 1
            `,
            [userId, courseId]
        );

        if (existing.length > 0) {
            return res.json({
                success: true,
                already_enrolled: true,
                message: "أنت مسجل بالفعل في هذه الدورة",
                enrollment_id: existing[0].id
            });
        }

        const [result] = await db.query(
            `
            INSERT INTO enrollments (user_id, course_id)
            VALUES (?, ?)
            `,
            [userId, courseId]
        );

        res.status(201).json({
            success: true,
            already_enrolled: false,
            message: "تم التسجيل في الدورة بنجاح",
            enrollment_id: result.insertId
        });
    } catch (error) {
        console.error("Enroll error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء التسجيل في الدورة",
            error: error.message
        });
    }
});

// ============================================================
// GET USER ENROLLMENTS
// ============================================================

app.get("/api/enrollments/:userId", async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                success: false,
                message: "معرف المستخدم غير صحيح"
            });
        }

        const [rows] = await db.query(
            `
            SELECT
                e.id,
                e.user_id,
                e.course_id,
                e.enrolled_at,
                c.title,
                c.category,
                c.instructor,
                c.description,
                c.duration,
                c.image
            FROM enrollments e
            INNER JOIN courses c ON e.course_id = c.id
            WHERE e.user_id = ?
            ORDER BY e.enrolled_at DESC
            `,
            [userId]
        );

        res.json({
            success: true,
            enrollments: rows
        });
    } catch (error) {
        console.error("User enrollments error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل التسجيلات",
            error: error.message
        });
    }
});

// ============================================================
// GET COURSE ENROLLMENTS
// ============================================================

app.get("/api/course-enrollments/:courseId", async (req, res) => {
    try {
        const courseId = Number(req.params.courseId);

        if (!Number.isInteger(courseId) || courseId <= 0) {
            return res.status(400).json({
                success: false,
                message: "رقم الدورة غير صحيح"
            });
        }

        const [rows] = await db.query(
            `
            SELECT
                e.id,
                e.user_id,
                e.course_id,
                e.enrolled_at,
                u.name,
                u.email
            FROM enrollments e
            INNER JOIN users u ON e.user_id = u.id
            WHERE e.course_id = ?
            ORDER BY e.enrolled_at DESC
            `,
            [courseId]
        );

        res.json({
            success: true,
            enrollments: rows
        });
    } catch (error) {
        console.error("Course enrollments error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل طلاب الدورة",
            error: error.message
        });
    }
});

// ============================================================
// CHECK ENROLLMENT
// ============================================================

app.get(
    "/api/enrollment/:userId/:courseId",
    async (req, res) => {
        try {
            const userId = Number(req.params.userId);
            const courseId = Number(req.params.courseId);

            if (
                !Number.isInteger(userId) || userId <= 0 ||
                !Number.isInteger(courseId) || courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "بيانات التسجيل غير صحيحة"
                });
            }

            const [rows] = await db.query(
                `
                SELECT id, user_id, course_id, enrolled_at
                FROM enrollments
                WHERE user_id = ? AND course_id = ?
                LIMIT 1
                `,
                [userId, courseId]
            );

            res.json({
                success: true,
                enrolled: rows.length > 0,
                enrollment: rows[0] || null
            });
        } catch (error) {
            console.error("Check enrollment error:", error);

            res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء التحقق من التسجيل",
                error: error.message
            });
        }
    }
);

// ============================================================
// DELETE ENROLLMENT
// ============================================================

app.delete(
    "/api/enrollment/:userId/:courseId",
    async (req, res) => {
        try {
            const userId = Number(req.params.userId);
            const courseId = Number(req.params.courseId);

            if (
                !Number.isInteger(userId) || userId <= 0 ||
                !Number.isInteger(courseId) || courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "بيانات التسجيل غير صحيحة"
                });
            }

            const [existing] = await db.query(
                `
                SELECT id
                FROM enrollments
                WHERE user_id = ? AND course_id = ?
                LIMIT 1
                `,
                [userId, courseId]
            );

            if (existing.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "التسجيل غير موجود"
                });
            }

            await db.query(
                `
                DELETE FROM progress
                WHERE user_id = ? AND course_id = ?
                `,
                [userId, courseId]
            );

            await db.query(
                `
                DELETE FROM enrollments
                WHERE user_id = ? AND course_id = ?
                `,
                [userId, courseId]
            );

            res.json({
                success: true,
                message: "تم إلغاء التسجيل بنجاح"
            });
        } catch (error) {
            console.error("Delete enrollment error:", error);

            res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء إلغاء التسجيل",
                error: error.message
            });
        }
    }
);

// ============================================================
// SAVE PROGRESS
// ============================================================

app.post("/api/progress", async (req, res) => {
    try {
        const { user_id, course_id, lesson_id } = req.body;

        const userId = Number(user_id);
        const courseId = Number(course_id);
        const lessonId = Number(lesson_id);

        if (
            !Number.isInteger(userId) || userId <= 0 ||
            !Number.isInteger(courseId) || courseId <= 0 ||
            !Number.isInteger(lessonId) || lessonId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "بيانات التقدم غير صحيحة"
            });
        }

        const [enrollment] = await db.query(
            `
            SELECT id
            FROM enrollments
            WHERE user_id = ? AND course_id = ?
            LIMIT 1
            `,
            [userId, courseId]
        );

        if (enrollment.length === 0) {
            return res.status(403).json({
                success: false,
                message: "يجب التسجيل في الدورة أولاً"
            });
        }

        const [lesson] = await db.query(
            `
            SELECT id
            FROM lessons
            WHERE id = ? AND course_id = ?
            LIMIT 1
            `,
            [lessonId, courseId]
        );

        if (lesson.length === 0) {
            return res.status(404).json({
                success: false,
                message: "المحاضرة غير موجودة في هذه الدورة"
            });
        }

        const [existingProgress] = await db.query(
            `
            SELECT id
            FROM progress
            WHERE user_id = ?
              AND course_id = ?
              AND lesson_id = ?
            LIMIT 1
            `,
            [userId, courseId, lessonId]
        );

        if (existingProgress.length > 0) {
            await db.query(
                `
                UPDATE progress
                SET completed = 1, completed_at = NOW()
                WHERE id = ?
                `,
                [existingProgress[0].id]
            );
        } else {
            await db.query(
                `
                INSERT INTO progress
                    (user_id, course_id, lesson_id, completed, completed_at)
                VALUES (?, ?, ?, 1, NOW())
                `,
                [userId, courseId, lessonId]
            );
        }

        res.json({
            success: true,
            message: "تم حفظ تقدمك بنجاح"
        });
    } catch (error) {
        console.error("Progress error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء حفظ التقدم",
            error: error.message
        });
    }
});

// ============================================================
// GET USER COURSE PROGRESS
// ============================================================

app.get(
    "/api/progress/:userId/:courseId",
    async (req, res) => {
        try {
            const userId = Number(req.params.userId);
            const courseId = Number(req.params.courseId);

            if (
                !Number.isInteger(userId) || userId <= 0 ||
                !Number.isInteger(courseId) || courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "بيانات التقدم غير صحيحة"
                });
            }

            const [rows] = await db.query(
                `
                SELECT
                    p.id,
                    p.user_id,
                    p.course_id,
                    p.lesson_id,
                    p.completed,
                    p.completed_at,
                    l.title AS lesson_title
                FROM progress p
                INNER JOIN lessons l ON p.lesson_id = l.id
                WHERE p.user_id = ?
                  AND p.course_id = ?
                  AND p.completed = 1
                ORDER BY l.lesson_order ASC, l.id ASC
                `,
                [userId, courseId]
            );

            res.json({
                success: true,
                progress: rows
            });
        } catch (error) {
            console.error("Get progress error:", error);

            res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء تحميل التقدم",
                error: error.message
            });
        }
    }
);
// ============================================================
// CERTIFICATE HELPERS
// ============================================================

function safeCertificateLanguage(language) {
    return language === "ar" ? "ar" : "en";
}

function formatCertificateDate(date, language) {
    const locale = language === "ar" ? "ar-EG" : "en-GB";
    const dateObject = new Date(date);

    if (Number.isNaN(dateObject.getTime())) {
        return "";
    }

    return dateObject.toLocaleDateString(locale, {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================
// CREATE CERTIFICATE
// ============================================================

app.post("/api/certificate", async (req, res) => {
    try {
        const userId = Number(req.body.user_id);
        const courseId = Number(req.body.course_id);
        const language = safeCertificateLanguage(req.body.language);

        if (
            !Number.isInteger(userId) || userId <= 0 ||
            !Number.isInteger(courseId) || courseId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "بيانات الشهادة غير صحيحة"
            });
        }

        const [users] = await db.query(
            "SELECT id, name, email FROM users WHERE id = ? LIMIT 1",
            [userId]
        );

        if (!users.length) {
            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        const [courses] = await db.query(
            "SELECT id, title, instructor FROM courses WHERE id = ? LIMIT 1",
            [courseId]
        );

        if (!courses.length) {
            return res.status(404).json({
                success: false,
                message: "الدورة غير موجودة"
            });
        }

        const [enrollments] = await db.query(
            "SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1",
            [userId, courseId]
        );

        if (!enrollments.length) {
            return res.status(403).json({
                success: false,
                message: "يجب التسجيل في الدورة أولاً"
            });
        }

        const [[lessonCount]] = await db.query(
            "SELECT COUNT(*) AS total FROM lessons WHERE course_id = ?",
            [courseId]
        );

        const [[completedCount]] = await db.query(
            `SELECT COUNT(DISTINCT lesson_id) AS total
             FROM progress
             WHERE user_id = ? AND course_id = ? AND completed = 1`,
            [userId, courseId]
        );

        const total = Number(lessonCount.total || 0);
        const completed = Number(completedCount.total || 0);

        if (total === 0 || completed < total) {
            return res.status(400).json({
                success: false,
                message: total === 0
                    ? "لا توجد محاضرات في هذه الدورة"
                    : `يجب إكمال جميع المحاضرات أولاً. أكملت ${completed} من ${total}`
            });
        }

        const [existing] = await db.query(
            `SELECT id, certificate_id, issued_at
             FROM certificates
             WHERE user_id = ? AND course_id = ?
             LIMIT 1`,
            [userId, courseId]
        );

        let certificate;

        if (existing.length) {
            certificate = existing[0];
        } else {
            let certificateNumber;
            let foundUnique = false;

            for (let attempt = 0; attempt < 10; attempt++) {
                certificateNumber =
                    `ZAWAM-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

                const [duplicates] = await db.query(
                    "SELECT id FROM certificates WHERE certificate_id = ? LIMIT 1",
                    [certificateNumber]
                );

                if (!duplicates.length) {
                    foundUnique = true;
                    break;
                }
            }

            if (!foundUnique) {
                return res.status(500).json({
                    success: false,
                    message: "تعذر إنشاء رقم شهادة فريد"
                });
            }

            const [result] = await db.query(
                `INSERT INTO certificates
                 (certificate_id, user_id, course_id, issued_at)
                 VALUES (?, ?, ?, NOW())`,
                [certificateNumber, userId, courseId]
            );

            const [created] = await db.query(
                `SELECT id, certificate_id, issued_at
                 FROM certificates WHERE id = ? LIMIT 1`,
                [result.insertId]
            );

            certificate = created[0];
        }

        res.status(existing.length ? 200 : 201).json({
            success: true,
            already_exists: existing.length > 0,
            certificate: {
                id: certificate.id,
                certificate_id: certificate.certificate_id,
                certificate_number: certificate.certificate_id,
                student_name: users[0].name,
                course_title: courses[0].title,
                issue_date: certificate.issued_at,
                issued_at: certificate.issued_at,
                language,
                pdf_url: `/api/certificate/${certificate.id}/pdf?language=${language}`
            }
        });
    } catch (error) {
        console.error("Certificate creation error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء إنشاء الشهادة",
            error: error.message
        });
    }
});

// ============================================================
// GET CERTIFICATE DETAILS
// ============================================================

app.get("/api/certificate/:certificateId", async (req, res) => {
    try {
        const id = Number(req.params.certificateId);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: "معرف الشهادة غير صحيح"
            });
        }

        const [rows] = await db.query(
            `SELECT cert.id, cert.certificate_id, cert.issued_at,
                    cert.user_id, cert.course_id,
                    u.name AS student_name, u.email AS student_email,
                    c.title AS course_title, c.instructor
             FROM certificates cert
             INNER JOIN users u ON cert.user_id = u.id
             INNER JOIN courses c ON cert.course_id = c.id
             WHERE cert.id = ? LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: "الشهادة غير موجودة"
            });
        }

        res.json({
            success: true,
            certificate: {
                ...rows[0],
                certificate_number: rows[0].certificate_id,
                issue_date: rows[0].issued_at
            }
        });
    } catch (error) {
        console.error("Get certificate error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل الشهادة",
            error: error.message
        });
    }
});

// ============================================================
// GENERATE CERTIFICATE PDF
// ============================================================

app.get("/api/certificate/:certificateId/pdf", async (req, res) => {
    let browser;

    try {
        const id = Number(req.params.certificateId);
        const language = safeCertificateLanguage(req.query.language);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: "معرف الشهادة غير صحيح"
            });
        }

        const [rows] = await db.query(
            `SELECT cert.id, cert.certificate_id, cert.issued_at,
                    u.name AS student_name, c.title AS course_title
             FROM certificates cert
             INNER JOIN users u ON cert.user_id = u.id
             INNER JOIN courses c ON cert.course_id = c.id
             WHERE cert.id = ? LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: "الشهادة غير موجودة"
            });
        }

        const cert = rows[0];
        const isArabic = language === "ar";
        const studentName = escapeHtml(cert.student_name);
        const courseTitle = escapeHtml(cert.course_title);
        const certificateNumber = escapeHtml(cert.certificate_id);
        const date = escapeHtml(
            formatCertificateDate(cert.issued_at, language)
        );

        const title = isArabic ? "شهادة إتمام دورة" : "CERTIFICATE OF COMPLETION";
        const intro = isArabic
            ? "تشهد منصة زوام التعليمية بأن"
            : "This is to certify that";
        const completedText = isArabic
            ? "قد أتم بنجاح جميع متطلبات الدورة"
            : "has successfully completed the course";
        const dateLabel = isArabic ? "تاريخ الإصدار" : "ISSUE DATE";
        const management = isArabic
            ? "إدارة منصة زوام التعليمية"
            : "ZAWAM Educational Platform";

        const html = `<!DOCTYPE html>
<html lang="${language}" dir="${isArabic ? "rtl" : "ltr"}">
<head>
<meta charset="UTF-8">
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body {
    margin: 0;
    font-family: Arial, Tahoma, sans-serif;
    background: #fff;
}
.certificate {
    width: 297mm;
    height: 210mm;
    padding: 20mm;
    border: 9px solid #102A43;
    outline: 2px solid #C9A227;
    outline-offset: -17px;
    text-align: center;
    color: #102A43;
    position: relative;
}
.logo {
    display: inline-block;
    padding: 8px 24px;
    color: #C9A227;
    background: #102A43;
    border: 2px solid #C9A227;
    font-weight: bold;
    letter-spacing: 3px;
}
h1 { margin: 16px 0 6px; font-size: 30px; }
.gold-line { width: 150px; height: 3px; background: #C9A227; margin: 10px auto 20px; }
.intro { font-size: 16px; margin-top: 10px; }
.student { font-size: 32px; font-weight: bold; margin: 12px 0; }
.course {
    display: inline-block;
    border: 2px solid #C9A227;
    background: #fbf8ef;
    padding: 12px 28px;
    margin: 10px auto;
    font-size: 23px;
    font-weight: bold;
}
.description { margin: 14px auto; font-size: 15px; }
.bottom {
    position: absolute;
    bottom: 20mm;
    left: 25mm;
    right: 25mm;
    display: flex;
    justify-content: space-between;
    align-items: end;
    font-size: 13px;
}
.seal {
    border: 3px double #C9A227;
    border-radius: 50%;
    padding: 15px;
    font-weight: bold;
}
.number {
    position: absolute;
    bottom: 6mm;
    left: 0;
    right: 0;
    font-size: 10px;
    direction: ltr;
}
</style>
</head>
<body>
<div class="certificate">
    <div class="logo">ZAWAM</div>
    <h1>${title}</h1>
    <div class="gold-line"></div>
    <div class="intro">${intro}</div>
    <div class="student">${studentName}</div>
    <div>${completedText}</div>
    <div class="course">${courseTitle}</div>
    <div class="description">
        ${isArabic
            ? "تُمنح هذه الشهادة تقديرًا للجهد والالتزام والإنجاز في رحلة التعلم."
            : "Awarded in recognition of effort, commitment, and achievement throughout the learning journey."}
    </div>
    <div class="bottom">
        <div><strong>${dateLabel}</strong><br>${date}</div>
        <div class="seal">★<br>ZAWAM<br>VERIFIED</div>
        <div><strong>${management}</strong></div>
    </div>
    <div class="number">${certificateNumber}</div>
</div>
</body>
</html>`;

        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        const page = await browser.newPage();

        await page.setContent(html, { waitUntil: "networkidle0" });

        const pdf = await page.pdf({
            format: "A4",
            landscape: true,
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="ZAWAM-Certificate-${cert.certificate_id}.pdf"`
        );
        res.setHeader("Content-Length", pdf.length);
        res.end(pdf);
    } catch (error) {
        console.error("Certificate PDF error:", error);

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء إنشاء ملف الشهادة",
                error: error.message
            });
        }
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                console.error("Browser close error:", error);
            }
        }
    }
});

// ============================================================
// GET USER CERTIFICATES
// ============================================================

app.get("/api/certificates/:userId", async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                success: false,
                message: "معرف المستخدم غير صحيح"
            });
        }

        const [certificates] = await db.query(
            `SELECT cert.id, cert.certificate_id, cert.issued_at,
                    cert.user_id, cert.course_id,
                    c.title AS course_title, c.instructor
             FROM certificates cert
             INNER JOIN courses c ON cert.course_id = c.id
             WHERE cert.user_id = ?
             ORDER BY cert.issued_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            certificates: certificates.map(cert => ({
                ...cert,
                certificate_number: cert.certificate_id,
                issue_date: cert.issued_at,
                pdf_url: `/api/certificate/${cert.id}/pdf`
            }))
        });
    } catch (error) {
        console.error("User certificates error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل الشهادات",
            error: error.message
        });
    }
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error("Unhandled server error:", err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        success: false,
        message: "حدث خطأ غير متوقع في الخادم",
        error: err.message
    });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log("========================================");
    console.log("       ZAWAM SERVER STARTED 🚀");
    console.log("========================================");
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`API:    http://localhost:${PORT}/api`);
    console.log("========================================");
});
