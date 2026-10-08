const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const puppeteer = require("puppeteer");

const db = require("./db");
const adminRoutes = require("./admin-routes");

const app = express();
const PORT = 5000;

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
            const userId =
                Number(req.params.userId);

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "معرف المستخدم غير صحيح"
                });
            }

            const [users] = await db.query(
                `
                SELECT
                    id,
                    name,
                    email,
                    role,
                    created_at
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [userId]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "المستخدم غير موجود"
                });
            }

            res.json({
                success: true,
                user: users[0]
            });
        } catch (error) {
            console.error(
                "Profile error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل الملف الشخصي",
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
            const userId =
                Number(req.params.userId);

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "معرف المستخدم غير صحيح"
                });
            }

            const [users] = await db.query(
                `
                SELECT
                    id,
                    name,
                    email,
                    role,
                    created_at
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [userId]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "المستخدم غير موجود"
                });
            }

            const [enrollments] =
                await db.query(
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
                    INNER JOIN courses c
                        ON e.course_id = c.id
                    WHERE e.user_id = ?
                    ORDER BY e.enrolled_at DESC
                    `,
                    [userId]
                );

            const courses = [];

            for (const course of enrollments) {
                const [lessonRows] =
                    await db.query(
                        `
                        SELECT COUNT(*) AS total_lessons
                        FROM lessons
                        WHERE course_id = ?
                        `,
                        [course.course_id]
                    );

                const [completedRows] =
                    await db.query(
                        `
                        SELECT
                            COUNT(DISTINCT lesson_id)
                            AS completed_lessons
                        FROM progress
                        WHERE user_id = ?
                        AND course_id = ?
                        AND completed = 1
                        `,
                        [
                            userId,
                            course.course_id
                        ]
                    );

                const totalLessons =
                    Number(
                        lessonRows[0]
                            ?.total_lessons || 0
                    );

                const completedLessons =
                    Number(
                        completedRows[0]
                            ?.completed_lessons || 0
                    );

                const progress =
                    totalLessons > 0
                        ? Math.min(
                            100,
                            Math.round(
                                (
                                    completedLessons /
                                    totalLessons
                                ) * 100
                            )
                        )
                        : 0;

                courses.push({
                    ...course,
                    total_lessons:
                        totalLessons,
                    completed_lessons:
                        completedLessons,
                    progress
                });
            }

            const [certificates] =
                await db.query(
                    `
                    SELECT
                        cert.id,
                        cert.certificate_id,
                        cert.user_id,
                        cert.course_id,
                        cert.issued_at,
                        c.title AS course_title
                    FROM certificates cert
                    INNER JOIN courses c
                        ON cert.course_id = c.id
                    WHERE cert.user_id = ?
                    ORDER BY cert.issued_at DESC
                    `,
                    [userId]
                );

            const completedCourses =
                courses.filter(
                    course =>
                        course.progress >= 100
                ).length;

            res.json({
                success: true,
                user: users[0],
                stats: {
                    total_courses:
                        courses.length,
                    completed_courses:
                        completedCourses,
                    certificates:
                        certificates.length
                },
                courses,
                certificates
            });
        } catch (error) {
            console.error(
                "Dashboard error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل لوحة المستخدم",
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
        console.error(
            "Courses error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "حدث خطأ أثناء تحميل الدورات",
            error: error.message
        });
    }
});

// ============================================================
// GET COURSE LESSONS
// ============================================================

app.get(
    "/api/lessons/:courseId",
    async (req, res) => {
        try {
            const courseId =
                Number(req.params.courseId);

            if (
                !Number.isInteger(courseId) ||
                courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "معرف الدورة غير صحيح"
                });
            }

            const [lessons] =
                await db.query(
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
                    ORDER BY
                        lesson_order ASC,
                        id ASC
                    `,
                    [courseId]
                );

            res.json({
                success: true,
                lessons
            });
        } catch (error) {
            console.error(
                "Lessons error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل المحاضرات",
                error: error.message
            });
        }
    }
);

// ============================================================
// GET SINGLE LESSON
// ============================================================

app.get(
    "/api/lesson/:id",
    async (req, res) => {
        try {
            const lessonId =
                Number(req.params.id);

            if (
                !Number.isInteger(lessonId) ||
                lessonId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "معرف المحاضرة غير صحيح"
                });
            }

            const [lessons] =
                await db.query(
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
                    message:
                        "المحاضرة غير موجودة"
                });
            }

            res.json({
                success: true,
                lesson: lessons[0]
            });
        } catch (error) {
            console.error(
                "Single lesson error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل المحاضرة",
                error: error.message
            });
        }
    }
);

// ============================================================
// ENROLL IN COURSE
// ============================================================

app.post(
    "/api/enroll",
    async (req, res) => {
        try {
            const {
                user_id,
                course_id
            } = req.body;

            const userId =
                Number(user_id);

            const courseId =
                Number(course_id);

            if (
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !Number.isInteger(courseId) ||
                courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "بيانات التسجيل غير صحيحة"
                });
            }

            const [users] =
                await db.query(
                    `
                    SELECT id
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [userId]
                );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "المستخدم غير موجود"
                });
            }

            const [courses] =
                await db.query(
                    `
                    SELECT id
                    FROM courses
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [courseId]
                );

            if (courses.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "الدورة غير موجودة"
                });
            }

            const [existing] =
                await db.query(
                    `
                    SELECT id
                    FROM enrollments
                    WHERE user_id = ?
                    AND course_id = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        courseId
                    ]
                );

            if (existing.length > 0) {
                return res.json({
                    success: true,
                    already_enrolled:
                        true,
                    message:
                        "أنت مسجل بالفعل في هذه الدورة",
                    enrollment_id:
                        existing[0].id
                });
            }

            const [result] =
                await db.query(
                    `
                    INSERT INTO enrollments
                    (
                        user_id,
                        course_id
                    )
                    VALUES (?, ?)
                    `,
                    [
                        userId,
                        courseId
                    ]
                );

            res.status(201).json({
                success: true,
                already_enrolled:
                    false,
                message:
                    "تم التسجيل في الدورة بنجاح",
                enrollment_id:
                    result.insertId
            });
        } catch (error) {
            console.error(
                "Enroll error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء التسجيل في الدورة",
                error: error.message
            });
        }
    }
);

// ============================================================
// GET USER ENROLLMENTS
// ============================================================

app.get(
    "/api/enrollments/:userId",
    async (req, res) => {
        try {
            const userId =
                Number(req.params.userId);

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "معرف المستخدم غير صحيح"
                });
            }

            const [rows] =
                await db.query(
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
                    INNER JOIN courses c
                        ON e.course_id = c.id
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
            console.error(
                "User enrollments error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل التسجيلات",
                error: error.message
            });
        }
    }
);

// ============================================================
// GET COURSE ENROLLMENTS
// ============================================================

app.get(
    "/api/course-enrollments/:courseId",
    async (req, res) => {
        try {
            const courseId =
                Number(req.params.courseId);

            if (
                !Number.isInteger(courseId) ||
                courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "رقم الدورة غير صحيح"
                });
            }

            const [rows] =
                await db.query(
                    `
                    SELECT
                        e.id,
                        e.user_id,
                        e.course_id,
                        e.enrolled_at,
                        u.name,
                        u.email
                    FROM enrollments e
                    INNER JOIN users u
                        ON e.user_id = u.id
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
            console.error(
                "Course enrollments error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل طلاب الدورة",
                error: error.message
            });
        }
    }
);

// ============================================================
// CHECK ENROLLMENT
// ============================================================

app.get(
    "/api/enrollment/:userId/:courseId",
    async (req, res) => {
        try {
            const userId =
                Number(req.params.userId);

            const courseId =
                Number(req.params.courseId);

            if (
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !Number.isInteger(courseId) ||
                courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "بيانات التسجيل غير صحيحة"
                });
            }

            const [rows] =
                await db.query(
                    `
                    SELECT
                        id,
                        user_id,
                        course_id,
                        enrolled_at
                    FROM enrollments
                    WHERE user_id = ?
                    AND course_id = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        courseId
                    ]
                );

            res.json({
                success: true,
                enrolled:
                    rows.length > 0,
                enrollment:
                    rows[0] || null
            });
        } catch (error) {
            console.error(
                "Check enrollment error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء التحقق من التسجيل",
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
            const userId =
                Number(req.params.userId);

            const courseId =
                Number(req.params.courseId);

            if (
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !Number.isInteger(courseId) ||
                courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "بيانات التسجيل غير صحيحة"
                });
            }

            const [existing] =
                await db.query(
                    `
                    SELECT id
                    FROM enrollments
                    WHERE user_id = ?
                    AND course_id = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        courseId
                    ]
                );

            if (existing.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "التسجيل غير موجود"
                });
            }

            await db.query(
                `
                DELETE FROM progress
                WHERE user_id = ?
                AND course_id = ?
                `,
                [
                    userId,
                    courseId
                ]
            );

            await db.query(
                `
                DELETE FROM enrollments
                WHERE user_id = ?
                AND course_id = ?
                `,
                [
                    userId,
                    courseId
                ]
            );

            res.json({
                success: true,
                message:
                    "تم إلغاء التسجيل بنجاح"
            });
        } catch (error) {
            console.error(
                "Delete enrollment error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء إلغاء التسجيل",
                error: error.message
            });
        }
    }
);

// ============================================================
// SAVE PROGRESS
// ============================================================

app.post(
    "/api/progress",
    async (req, res) => {
        try {
            const {
                user_id,
                course_id,
                lesson_id
            } = req.body;

            const userId =
                Number(user_id);

            const courseId =
                Number(course_id);

            const lessonId =
                Number(lesson_id);

            if (
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !Number.isInteger(courseId) ||
                courseId <= 0 ||
                !Number.isInteger(lessonId) ||
                lessonId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "بيانات التقدم غير صحيحة"
                });
            }

            const [enrollment] =
                await db.query(
                    `
                    SELECT id
                    FROM enrollments
                    WHERE user_id = ?
                    AND course_id = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        courseId
                    ]
                );

            if (enrollment.length === 0) {
                return res.status(403).json({
                    success: false,
                    message:
                        "يجب التسجيل في الدورة أولاً"
                });
            }

            const [lesson] =
                await db.query(
                    `
                    SELECT id
                    FROM lessons
                    WHERE id = ?
                    AND course_id = ?
                    LIMIT 1
                    `,
                    [
                        lessonId,
                        courseId
                    ]
                );

            if (lesson.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "المحاضرة غير موجودة في هذه الدورة"
                });
            }

            const [existingProgress] =
                await db.query(
                    `
                    SELECT id
                    FROM progress
                    WHERE user_id = ?
                    AND course_id = ?
                    AND lesson_id = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        courseId,
                        lessonId
                    ]
                );

            if (
                existingProgress.length > 0
            ) {
                await db.query(
                    `
                    UPDATE progress
                    SET
                        completed = 1,
                        completed_at = NOW()
                    WHERE id = ?
                    `,
                    [
                        existingProgress[0].id
                    ]
                );
            } else {
                await db.query(
                    `
                    INSERT INTO progress
                    (
                        user_id,
                        course_id,
                        lesson_id,
                        completed,
                        completed_at
                    )
                    VALUES (?, ?, ?, 1, NOW())
                    `,
                    [
                        userId,
                        courseId,
                        lessonId
                    ]
                );
            }

            res.json({
                success: true,
                message:
                    "تم حفظ تقدمك بنجاح"
            });
        } catch (error) {
            console.error(
                "Progress error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء حفظ التقدم",
                error: error.message
            });
        }
    }
);

// ============================================================
// GET USER COURSE PROGRESS
// ============================================================

app.get(
    "/api/progress/:userId/:courseId",
    async (req, res) => {
        try {
            const userId =
                Number(req.params.userId);

            const courseId =
                Number(req.params.courseId);

            if (
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !Number.isInteger(courseId) ||
                courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "بيانات التقدم غير صحيحة"
                });
            }

            const [rows] =
                await db.query(
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
                    INNER JOIN lessons l
                        ON p.lesson_id = l.id
                    WHERE p.user_id = ?
                    AND p.course_id = ?
                    AND p.completed = 1
                    ORDER BY
                        l.lesson_order ASC,
                        l.id ASC
                    `,
                    [
                        userId,
                        courseId
                    ]
                );

            res.json({
                success: true,
                progress: rows
            });
        } catch (error) {
            console.error(
                "Get progress error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل التقدم",
                error: error.message
            });
        }
    }
);

// ============================================================
// CERTIFICATE HELPERS
// ============================================================

function safeCertificateLanguage(language) {
    return language === "ar"
        ? "ar"
        : "en";
}

function formatCertificateDate(date, language) {
    const lang =
        safeCertificateLanguage(language);

    const dateObject =
        new Date(date);

    if (
        Number.isNaN(
            dateObject.getTime()
        )
    ) {
        return "";
    }

    if (lang === "ar") {
        return dateObject.toLocaleDateString(
            "ar-EG",
            {
                year: "numeric",
                month: "long",
                day: "numeric"
            }
        );
    }

    return dateObject.toLocaleDateString(
        "en-GB",
        {
            year: "numeric",
            month: "long",
            day: "numeric"
        }
    );
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

app.post(
    "/api/certificate",
    async (req, res) => {
        try {
            const {
                user_id,
                course_id,
                language
            } = req.body;

            const userId =
                Number(user_id);

            const courseId =
                Number(course_id);

            const certificateLanguage =
                safeCertificateLanguage(
                    language
                );

            if (
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !Number.isInteger(courseId) ||
                courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "بيانات الشهادة غير صحيحة"
                });
            }

            const [users] =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [userId]
                );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "المستخدم غير موجود"
                });
            }

            const user =
                users[0];

            const [courses] =
                await db.query(
                    `
                    SELECT
                        id,
                        title,
                        instructor
                    FROM courses
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [courseId]
                );

            if (courses.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "الدورة غير موجودة"
                });
            }

            const course =
                courses[0];

            const [enrollments] =
                await db.query(
                    `
                    SELECT id
                    FROM enrollments
                    WHERE user_id = ?
                    AND course_id = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        courseId
                    ]
                );

            if (enrollments.length === 0) {
                return res.status(403).json({
                    success: false,
                    message:
                        "يجب التسجيل في الدورة أولاً"
                });
            }

            const [lessonRows] =
                await db.query(
                    `
                    SELECT
                        COUNT(*) AS total_lessons
                    FROM lessons
                    WHERE course_id = ?
                    `,
                    [courseId]
                );

            const [completedRows] =
                await db.query(
                    `
                    SELECT
                        COUNT(DISTINCT lesson_id)
                        AS completed_lessons
                    FROM progress
                    WHERE user_id = ?
                    AND course_id = ?
                    AND completed = 1
                    `,
                    [
                        userId,
                        courseId
                    ]
                );

            const totalLessons =
                Number(
                    lessonRows[0]
                        ?.total_lessons || 0
                );

            const completedLessons =
                Number(
                    completedRows[0]
                        ?.completed_lessons || 0
                );

            if (totalLessons === 0) {
                return res.status(400).json({
                    success: false,
                    message:
                        "لا توجد محاضرات في هذه الدورة"
                });
            }

            if (
                completedLessons <
                totalLessons
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `يجب إكمال جميع محاضرات الدورة أولاً. أكملت ${completedLessons} من ${totalLessons}`
                });
            }

            const [
                existingCertificates
            ] = await db.query(
                `
                SELECT
                    id,
                    certificate_id,
                    issued_at
                FROM certificates
                WHERE user_id = ?
                AND course_id = ?
                LIMIT 1
                `,
                [
                    userId,
                    courseId
                ]
            );

            if (
                existingCertificates.length >
                0
            ) {
                const existing =
                    existingCertificates[0];

                return res.json({
                    success: true,
                    already_exists: true,
                    certificate: {
                        id:
                            existing.id,

                        certificate_id:
                            existing.certificate_id,

                        certificate_number:
                            existing.certificate_id,

                        student_name:
                            user.name,

                        course_title:
                            course.title,

                        issue_date:
                            existing.issued_at,

                        issued_at:
                            existing.issued_at,

                        language:
                            certificateLanguage,

                        pdf_url:
                            `/api/certificate/${existing.id}/pdf?language=${certificateLanguage}`
                    }
                });
            }

            let certificateId;
            let attempts = 0;

            do {
                const year =
                    new Date().getFullYear();

                const randomNumber =
                    Math.floor(
                        100000 +
                        Math.random() *
                        900000
                    );

                certificateId =
                    `ZAWAM-${year}-${randomNumber}`;

                const [duplicate] =
                    await db.query(
                        `
                        SELECT id
                        FROM certificates
                        WHERE certificate_id = ?
                        LIMIT 1
                        `,
                        [certificateId]
                    );

                if (
                    duplicate.length === 0
                ) {
                    break;
                }

                attempts++;
            } while (attempts < 10);

            if (attempts >= 10) {
                return res.status(500).json({
                    success: false,
                    message:
                        "تعذر إنشاء رقم شهادة فريد"
                });
            }

            const [result] =
                await db.query(
                    `
                    INSERT INTO certificates
                    (
                        certificate_id,
                        user_id,
                        course_id,
                        issued_at
                    )
                    VALUES (?, ?, ?, NOW())
                    `,
                    [
                        certificateId,
                        userId,
                        courseId
                    ]
                );

            const certificateDbId =
                result.insertId;

            const [
                createdCertificates
            ] = await db.query(
                `
                SELECT
                    cert.id,
                    cert.certificate_id,
                    cert.user_id,
                    cert.course_id,
                    cert.issued_at,
                    u.name AS student_name,
                    u.email AS student_email,
                    c.title AS course_title,
                    c.instructor
                FROM certificates cert
                INNER JOIN users u
                    ON cert.user_id = u.id
                INNER JOIN courses c
                    ON cert.course_id = c.id
                WHERE cert.id = ?
                LIMIT 1
                `,
                [certificateDbId]
            );

            if (
                createdCertificates.length ===
                0
            ) {
                return res.status(500).json({
                    success: false,
                    message:
                        "تعذر إنشاء الشهادة"
                });
            }

            const certificate =
                createdCertificates[0];

            res.status(201).json({
                success: true,
                already_exists: false,

                certificate: {
                    id:
                        certificate.id,

                    certificate_id:
                        certificate.certificate_id,

                    certificate_number:
                        certificate.certificate_id,

                    student_name:
                        certificate.student_name,

                    course_title:
                        certificate.course_title,

                    issue_date:
                        certificate.issued_at,

                    issued_at:
                        certificate.issued_at,

                    language:
                        certificateLanguage,

                    pdf_url:
                        `/api/certificate/${certificate.id}/pdf?language=${certificateLanguage}`
                }
            });
        } catch (error) {
            console.error(
                "Certificate creation error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء إنشاء الشهادة",
                error: error.message
            });
        }
    }
);

// ============================================================
// GET CERTIFICATE DETAILS
// ============================================================

app.get(
    "/api/certificate/:certificateId",
    async (req, res) => {
        try {
            const certificateDbId =
                Number(
                    req.params.certificateId
                );

            if (
                !Number.isInteger(
                    certificateDbId
                ) ||
                certificateDbId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "معرف الشهادة غير صحيح"
                });
            }

            const [
                certificates
            ] = await db.query(
                `
                SELECT
                    cert.id,
                    cert.certificate_id,
                    cert.issued_at,
                    cert.user_id,
                    cert.course_id,
                    u.name AS student_name,
                    u.email AS student_email,
                    c.title AS course_title,
                    c.instructor
                FROM certificates cert
                INNER JOIN users u
                    ON cert.user_id = u.id
                INNER JOIN courses c
                    ON cert.course_id = c.id
                WHERE cert.id = ?
                LIMIT 1
                `,
                [certificateDbId]
            );

            if (
                certificates.length ===
                0
            ) {
                return res.status(404).json({
                    success: false,
                    message:
                        "الشهادة غير موجودة"
                });
            }

            const certificate =
                certificates[0];

            res.json({
                success: true,
                certificate: {
                    ...certificate,

                    certificate_number:
                        certificate.certificate_id,

                    issue_date:
                        certificate.issued_at
                }
            });
        } catch (error) {
            console.error(
                "Get certificate error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل الشهادة",
                error: error.message
            });
        }
    }
);

// ============================================================
// CERTIFICATE PDF USING PUPPETEER / CHROMIUM
// ============================================================

app.get(
    "/api/certificate/:certificateId/pdf",
    async (req, res) => {
        let browser = null;

        try {
            const certificateDbId =
                Number(
                    req.params.certificateId
                );

            const language =
                safeCertificateLanguage(
                    req.query.language
                );

            if (
                !Number.isInteger(
                    certificateDbId
                ) ||
                certificateDbId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "معرف الشهادة غير صحيح"
                });
            }

            const [
                certificates
            ] = await db.query(
                `
                SELECT
                    cert.id,
                    cert.certificate_id,
                    cert.issued_at,
                    u.name AS student_name,
                    c.title AS course_title,
                    c.instructor
                FROM certificates cert
                INNER JOIN users u
                    ON cert.user_id = u.id
                INNER JOIN courses c
                    ON cert.course_id = c.id
                WHERE cert.id = ?
                LIMIT 1
                `,
                [certificateDbId]
            );

            if (
                certificates.length ===
                0
            ) {
                return res.status(404).json({
                    success: false,
                    message:
                        "الشهادة غير موجودة"
                });
            }

            const certificate =
                certificates[0];

            const studentName =
                escapeHtml(
                    certificate.student_name
                );

            const courseTitle =
                escapeHtml(
                    certificate.course_title
                );

            const certificateNumber =
                escapeHtml(
                    certificate.certificate_id
                );

            const formattedDate =
                escapeHtml(
                    formatCertificateDate(
                        certificate.issued_at,
                        language
                    )
                );

            const isArabic =
                language === "ar";

            // ====================================================
            // ARABIC CERTIFICATE
            // ====================================================

            let certificateHtml = "";

            if (isArabic) {
                certificateHtml = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<style>

* {
    box-sizing: border-box;
}

@page {
    size: A4 landscape;
    margin: 0;
}

html,
body {
    margin: 0;
    padding: 0;
    width: 297mm;
    height: 210mm;
    background: #ffffff;
}

body {
    direction: rtl;
    font-family:
        Arial,
        "Segoe UI",
        Tahoma,
        sans-serif;
}

.certificate {
    width: 297mm;
    height: 210mm;
    position: relative;
    overflow: hidden;
    background:
        linear-gradient(
            135deg,
            #ffffff 0%,
            #fbfaf6 50%,
            #ffffff 100%
        );
    border: 9px solid #102A43;
}

/* =========================================================
   DECORATIVE BORDERS
   ========================================================= */

.outer-gold {
    position: absolute;
    top: 7px;
    left: 7px;
    right: 7px;
    bottom: 7px;
    border: 2px solid #C9A227;
}

.inner-border {
    position: absolute;
    top: 15px;
    left: 15px;
    right: 15px;
    bottom: 15px;
    border: 1px solid rgba(201,162,39,0.55);
}

.corner {
    position: absolute;
    width: 28mm;
    height: 28mm;
    border-color: #C9A227;
    border-style: solid;
    z-index: 3;
}

.corner-tl {
    top: 20px;
    left: 20px;
    border-width: 3px 0 0 3px;
}

.corner-tr {
    top: 20px;
    right: 20px;
    border-width: 3px 3px 0 0;
}

.corner-bl {
    bottom: 20px;
    left: 20px;
    border-width: 0 0 3px 3px;
}

.corner-br {
    bottom: 20px;
    right: 20px;
    border-width: 0 3px 3px 0;
}

/* =========================================================
   CONTENT
   ========================================================= */

.content {
    position: relative;
    z-index: 5;
    width: 100%;
    height: 100%;
    text-align: center;
}

/* =========================================================
   LOGO
   ========================================================= */

.logo {
    position: absolute;
    top: 12mm;
    left: 50%;
    transform: translateX(-50%);
    width: 34mm;
    height: 25mm;
    border-radius: 7px;
    background: #102A43;
    border: 2px solid #C9A227;
    box-shadow:
        0 3px 10px rgba(16,42,67,0.20);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    direction: ltr;
}

.logo-z {
    color: #C9A227;
    font-size: 28px;
    line-height: 27px;
    font-weight: 800;
}

.logo-name {
    color: #ffffff;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 2px;
}

/* =========================================================
   MEDALS
   ========================================================= */

.medal {
    position: absolute;
    top: 18mm;
    width: 27mm;
    height: 35mm;
    z-index: 6;
}

.medal-left {
    left: 34mm;
}

.medal-right {
    right: 34mm;
}

.ribbon {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 14mm;
    height: 12mm;
    background: #102A43;
    border-left: 3px solid #C9A227;
    border-right: 3px solid #C9A227;
}

.medal-circle {
    position: absolute;
    top: 8mm;
    left: 50%;
    transform: translateX(-50%);
    width: 22mm;
    height: 22mm;
    border-radius: 50%;
    background:
        radial-gradient(
            circle,
            #f8df76 0%,
            #C9A227 55%,
            #9b7610 100%
        );
    border: 3px solid #ffffff;
    outline: 2px solid #C9A227;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #102A43;
    font-size: 24px;
    font-weight: 900;
}

.medal-text {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    color: #102A43;
    font-size: 8px;
    font-weight: 700;
}

/* =========================================================
   MAIN TITLE
   ========================================================= */

.title {
    position: absolute;
    top: 43mm;
    left: 20mm;
    right: 20mm;
    color: #102A43;
    font-size: 31px;
    font-weight: 800;
    line-height: 1.2;
}

.subtitle-line {
    position: absolute;
    top: 57mm;
    left: 50%;
    transform: translateX(-50%);
    width: 65mm;
    height: 2px;
    background: #C9A227;
}

.subtitle {
    position: absolute;
    top: 60mm;
    left: 20mm;
    right: 20mm;
    color: #6b6b6b;
    font-size: 13px;
    line-height: 1.5;
}

/* =========================================================
   STUDENT
   ========================================================= */

.intro {
    position: absolute;
    top: 69mm;
    left: 20mm;
    right: 20mm;
    color: #555555;
    font-size: 14px;
    font-weight: 500;
}

.student {
    position: absolute;
    top: 76mm;
    left: 30mm;
    right: 30mm;
    color: #102A43;
    font-size: 30px;
    font-weight: 800;
    line-height: 1.3;
    max-height: 18mm;
    overflow: hidden;
}

.student-line {
    position: absolute;
    top: 94mm;
    left: 50%;
    transform: translateX(-50%);
    width: 100mm;
    height: 2px;
    background: #C9A227;
}

/* =========================================================
   COURSE TEXT
   ========================================================= */

.course-message {
    position: absolute;
    top: 100mm;
    left: 25mm;
    right: 25mm;
    color: #555555;
    font-size: 13px;
    line-height: 1.5;
}

.course-box {
    position: absolute;
    top: 108mm;
    left: 48mm;
    right: 48mm;
    min-height: 17mm;
    padding: 5px 15px;
    border: 2px solid #C9A227;
    border-radius: 7px;
    background: rgba(201,162,39,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
}

.course {
    color: #102A43;
    font-size: 21px;
    font-weight: 800;
    line-height: 1.35;
    max-width: 190mm;
}

/* =========================================================
   DESCRIPTION
   ========================================================= */

.description {
    position: absolute;
    top: 130mm;
    left: 53mm;
    right: 53mm;
    color: #5b5b5b;
    font-size: 11.5px;
    line-height: 1.8;
    text-align: center;
}

/* =========================================================
   BOTTOM AREA
   ========================================================= */

.bottom {
    position: absolute;
    left: 30mm;
    right: 30mm;
    bottom: 18mm;
    height: 27mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.info {
    width: 58mm;
    text-align: center;
    color: #555555;
    font-size: 10px;
    line-height: 1.7;
}

.info strong {
    display: block;
    color: #102A43;
    font-size: 11px;
    margin-bottom: 2px;
}

.certificate-id {
    direction: ltr;
    unicode-bidi: embed;
    font-family: Arial, sans-serif;
    font-size: 10px;
    font-weight: 700;
    color: #102A43;
}

/* =========================================================
   SEAL
   ========================================================= */

.seal {
    width: 31mm;
    height: 31mm;
    border-radius: 50%;
    border: 3px solid #C9A227;
    outline: 2px solid #102A43;
    outline-offset: 2px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #102A43;
    font-weight: 800;
}

.seal-star {
    color: #C9A227;
    font-size: 17px;
    line-height: 15px;
}

.seal-z {
    font-size: 15px;
    line-height: 17px;
}

.seal-text {
    font-size: 6px;
    letter-spacing: 1px;
    direction: ltr;
}

/* =========================================================
   SIGNATURE
   ========================================================= */

.signature {
    width: 58mm;
    text-align: center;
    color: #555555;
    font-size: 10px;
}

.signature-line {
    width: 48mm;
    height: 1px;
    background: #102A43;
    margin: 0 auto 4px;
}

.signature strong {
    color: #102A43;
    font-size: 10px;
}

/* =========================================================
   FOOTER
   ========================================================= */

.footer {
    position: absolute;
    bottom: 5mm;
    left: 0;
    right: 0;
    text-align: center;
    direction: ltr;
    color: #102A43;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1px;
}

</style>

</head>

<body>

<div class="certificate">

    <div class="outer-gold"></div>
    <div class="inner-border"></div>

    <div class="corner corner-tl"></div>
    <div class="corner corner-tr"></div>
    <div class="corner corner-bl"></div>
    <div class="corner corner-br"></div>

    <div class="content">

        <!-- LOGO -->

        <div class="logo">

            <div class="logo-z">
                Z
            </div>

            <div class="logo-name">
                ZAWAM
            </div>

        </div>

        <!-- LEFT MEDAL -->

        <div class="medal medal-left">

            <div class="ribbon"></div>

            <div class="medal-circle">
                ★
            </div>

            <div class="medal-text">
                إنجاز
            </div>

        </div>

        <!-- RIGHT MEDAL -->

        <div class="medal medal-right">

            <div class="ribbon"></div>

            <div class="medal-circle">
                ★
            </div>

            <div class="medal-text">
                تميز
            </div>

        </div>

        <!-- TITLE -->

        <div class="title">
            شهادة إتمام دورة
        </div>

        <div class="subtitle-line"></div>

        <div class="subtitle">
            تقديرًا للجهد والالتزام والإنجاز في رحلة التعلم
        </div>

        <!-- STUDENT -->

        <div class="intro">
            تشهد منصة ZAWAM التعليمية بأن
        </div>

        <div class="student">
            ${studentName}
        </div>

        <div class="student-line"></div>

        <!-- COURSE -->

        <div class="course-message">
            قد أتم بنجاح جميع متطلبات الدورة التعليمية
        </div>

        <div class="course-box">

            <div class="course">
                ${courseTitle}
            </div>

        </div>

        <!-- DESCRIPTION -->

        <div class="description">
            وذلك بعد إكمال المحتوى التعليمي المقرر للدورة
            واستيفاء متطلباتها بنجاح، وإظهار الالتزام
            والمواظبة في رحلة التعلم.
            <br>
            وتُمنح هذه الشهادة تقديرًا للجهد المبذول
            والإنجاز المحقق، مع تمنيات منصة ZAWAM
            بمزيد من التقدم والنجاح في المسيرة التعليمية والمهنية.
        </div>

        <!-- BOTTOM -->

        <div class="bottom">

            <div class="info">

                <strong>
                    تاريخ الإصدار
                </strong>

                ${formattedDate}

            </div>

            <div class="seal">

                <div class="seal-star">
                    ★
                </div>

                <div class="seal-z">
                    ZAWAM
                </div>

                <div class="seal-text">
                    VERIFIED
                </div>

            </div>

            <div class="signature">

                <div class="signature-line"></div>

                <strong>
                    إدارة منصة زوام التعليمية
                </strong>

            </div>

        </div>

        <div class="footer">
            ZAWAM EDUCATIONAL PLATFORM
        </div>

    </div>

    <!-- CERTIFICATE NUMBER -->

    <div
        style="
            position:absolute;
            bottom:5mm;
            right:28mm;
            color:#102A43;
            font-size:7px;
            font-family:Arial,sans-serif;
            direction:ltr;
        "
    >
        ${certificateNumber}
    </div>

</div>

</body>
</html>
`;
            }

            // ====================================================
            // ENGLISH CERTIFICATE
            // ====================================================

            else {
                certificateHtml = `
<!DOCTYPE html>
<html lang="en" dir="ltr">

<head>

<meta charset="UTF-8">

<style>

* {
    box-sizing: border-box;
}

@page {
    size: A4 landscape;
    margin: 0;
}

html,
body {
    margin: 0;
    padding: 0;
    width: 297mm;
    height: 210mm;
    background: #ffffff;
}

body {
    direction: ltr;
    font-family:
        Arial,
        "Segoe UI",
        Tahoma,
        sans-serif;
}

.certificate {
    width: 297mm;
    height: 210mm;
    position: relative;
    overflow: hidden;
    background:
        linear-gradient(
            135deg,
            #ffffff 0%,
            #fbfaf6 50%,
            #ffffff 100%
        );
    border: 9px solid #102A43;
}

.outer-gold {
    position: absolute;
    top: 7px;
    left: 7px;
    right: 7px;
    bottom: 7px;
    border: 2px solid #C9A227;
}

.inner-border {
    position: absolute;
    top: 15px;
    left: 15px;
    right: 15px;
    bottom: 15px;
    border: 1px solid rgba(201,162,39,0.55);
}

.corner {
    position: absolute;
    width: 28mm;
    height: 28mm;
    border-color: #C9A227;
    border-style: solid;
    z-index: 3;
}

.corner-tl {
    top: 20px;
    left: 20px;
    border-width: 3px 0 0 3px;
}

.corner-tr {
    top: 20px;
    right: 20px;
    border-width: 3px 3px 0 0;
}

.corner-bl {
    bottom: 20px;
    left: 20px;
    border-width: 0 0 3px 3px;
}

.corner-br {
    bottom: 20px;
    right: 20px;
    border-width: 0 3px 3px 0;
}

.content {
    position: relative;
    z-index: 5;
    width: 100%;
    height: 100%;
    text-align: center;
}

.logo {
    position: absolute;
    top: 12mm;
    left: 50%;
    transform: translateX(-50%);
    width: 34mm;
    height: 25mm;
    border-radius: 7px;
    background: #102A43;
    border: 2px solid #C9A227;
    box-shadow:
        0 3px 10px rgba(16,42,67,0.20);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.logo-z {
    color: #C9A227;
    font-size: 28px;
    line-height: 27px;
    font-weight: 800;
}

.logo-name {
    color: #ffffff;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 2px;
}

.medal {
    position: absolute;
    top: 18mm;
    width: 27mm;
    height: 35mm;
    z-index: 6;
}

.medal-left {
    left: 34mm;
}

.medal-right {
    right: 34mm;
}

.ribbon {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 14mm;
    height: 12mm;
    background: #102A43;
    border-left: 3px solid #C9A227;
    border-right: 3px solid #C9A227;
}

.medal-circle {
    position: absolute;
    top: 8mm;
    left: 50%;
    transform: translateX(-50%);
    width: 22mm;
    height: 22mm;
    border-radius: 50%;
    background:
        radial-gradient(
            circle,
            #f8df76 0%,
            #C9A227 55%,
            #9b7610 100%
        );
    border: 3px solid #ffffff;
    outline: 2px solid #C9A227;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #102A43;
    font-size: 24px;
    font-weight: 900;
}

.medal-text {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    color: #102A43;
    font-size: 8px;
    font-weight: 700;
}

.title {
    position: absolute;
    top: 43mm;
    left: 20mm;
    right: 20mm;
    color: #102A43;
    font-size: 31px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: 1px;
}

.subtitle-line {
    position: absolute;
    top: 57mm;
    left: 50%;
    transform: translateX(-50%);
    width: 65mm;
    height: 2px;
    background: #C9A227;
}

.subtitle {
    position: absolute;
    top: 60mm;
    left: 20mm;
    right: 20mm;
    color: #6b6b6b;
    font-size: 13px;
    line-height: 1.5;
}

.intro {
    position: absolute;
    top: 69mm;
    left: 20mm;
    right: 20mm;
    color: #555555;
    font-size: 14px;
}

.student {
    position: absolute;
    top: 76mm;
    left: 30mm;
    right: 30mm;
    color: #102A43;
    font-size: 30px;
    font-weight: 800;
    line-height: 1.3;
    max-height: 18mm;
    overflow: hidden;
}

.student-line {
    position: absolute;
    top: 94mm;
    left: 50%;
    transform: translateX(-50%);
    width: 100mm;
    height: 2px;
    background: #C9A227;
}

.course-message {
    position: absolute;
    top: 100mm;
    left: 25mm;
    right: 25mm;
    color: #555555;
    font-size: 13px;
    line-height: 1.5;
}

.course-box {
    position: absolute;
    top: 108mm;
    left: 48mm;
    right: 48mm;
    min-height: 17mm;
    padding: 5px 15px;
    border: 2px solid #C9A227;
    border-radius: 7px;
    background: rgba(201,162,39,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
}

.course {
    color: #102A43;
    font-size: 21px;
    font-weight: 800;
    line-height: 1.35;
    max-width: 190mm;
}

.description {
    position: absolute;
    top: 130mm;
    left: 53mm;
    right: 53mm;
    color: #5b5b5b;
    font-size: 11.5px;
    line-height: 1.8;
    text-align: center;
}

.bottom {
    position: absolute;
    left: 30mm;
    right: 30mm;
    bottom: 18mm;
    height: 27mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.info {
    width: 58mm;
    text-align: center;
    color: #555555;
    font-size: 10px;
    line-height: 1.7;
}

.info strong {
    display: block;
    color: #102A43;
    font-size: 11px;
    margin-bottom: 2px;
}

.certificate-id {
    direction: ltr;
    font-family: Arial, sans-serif;
    font-size: 10px;
    font-weight: 700;
    color: #102A43;
}

.seal {
    width: 31mm;
    height: 31mm;
    border-radius: 50%;
    border: 3px solid #C9A227;
    outline: 2px solid #102A43;
    outline-offset: 2px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #102A43;
    font-weight: 800;
}

.seal-star {
    color: #C9A227;
    font-size: 17px;
    line-height: 15px;
}

.seal-z {
    font-size: 15px;
    line-height: 17px;
}

.seal-text {
    font-size: 6px;
    letter-spacing: 1px;
}

.signature {
    width: 58mm;
    text-align: center;
    color: #555555;
    font-size: 10px;
}

.signature-line {
    width: 48mm;
    height: 1px;
    background: #102A43;
    margin: 0 auto 4px;
}

.signature strong {
    color: #102A43;
    font-size: 10px;
}

.footer {
    position: absolute;
    bottom: 5mm;
    left: 0;
    right: 0;
    text-align: center;
    color: #102A43;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1px;
}

</style>

</head>

<body>

<div class="certificate">

    <div class="outer-gold"></div>
    <div class="inner-border"></div>

    <div class="corner corner-tl"></div>
    <div class="corner corner-tr"></div>
    <div class="corner corner-bl"></div>
    <div class="corner corner-br"></div>

    <div class="content">

        <div class="logo">

            <div class="logo-z">
                Z
            </div>

            <div class="logo-name">
                ZAWAM
            </div>

        </div>

        <div class="medal medal-left">

            <div class="ribbon"></div>

            <div class="medal-circle">
                ★
            </div>

            <div class="medal-text">
                ACHIEVEMENT
            </div>

        </div>

        <div class="medal medal-right">

            <div class="ribbon"></div>

            <div class="medal-circle">
                ★
            </div>

            <div class="medal-text">
                EXCELLENCE
            </div>

        </div>

        <div class="title">
            CERTIFICATE OF COMPLETION
        </div>

        <div class="subtitle-line"></div>

        <div class="subtitle">
            In recognition of commitment, effort and achievement
            throughout the learning journey
        </div>

        <div class="intro">
            This is to certify that
        </div>

        <div class="student">
            ${studentName}
        </div>

        <div class="student-line"></div>

        <div class="course-message">
            has successfully completed all requirements of the course
        </div>

        <div class="course-box">

            <div class="course">
                ${courseTitle}
            </div>

        </div>

        <div class="description">
            The learner has successfully completed the required
            educational content and fulfilled the requirements
            of the course with commitment and dedication.
            <br>
            This certificate is awarded in recognition of the learner's
            effort, achievement, and successful completion of the
            educational requirements.
            ZAWAM Educational Platform wishes the learner continued
            success in their educational and professional journey.
        </div>

        <div class="bottom">

            <div class="info">

                <strong>
                    ISSUE DATE
                </strong>

                ${formattedDate}

            </div>

            <div class="seal">

                <div class="seal-star">
                    ★
                </div>

                <div class="seal-z">
                    ZAWAM
                </div>

                <div class="seal-text">
                    VERIFIED
                </div>

            </div>

            <div class="signature">

                <div class="signature-line"></div>

                <strong>
                    ZAWAM Educational Platform
                </strong>

            </div>

        </div>

        <div class="footer">
            ZAWAM EDUCATIONAL PLATFORM
        </div>

    </div>

    <div
        style="
            position:absolute;
            bottom:5mm;
            right:28mm;
            color:#102A43;
            font-size:7px;
            font-family:Arial,sans-serif;
            direction:ltr;
        "
    >
        ${certificateNumber}
    </div>

</div>

</body>
</html>
`;
            }

            // ====================================================
            // START CHROME
            // ====================================================

            browser =
                await puppeteer.launch({
                    headless: true
                });

            const page =
                await browser.newPage();

            await page.setViewport({
                width: 1123,
                height: 794,
                deviceScaleFactor: 1
            });

            // ====================================================
            // LOAD HTML
            // ====================================================

            await page.setContent(
                certificateHtml,
                {
                    waitUntil:
                        "networkidle0"
                }
            );

            // ====================================================
            // WAIT FOR FONTS
            // ====================================================

            await page.evaluate(
                async () => {
                    if (
                        document.fonts &&
                        document.fonts.ready
                    ) {
                        await document.fonts.ready;
                    }
                }
            );

            // ====================================================
            // CREATE PDF
            // ====================================================

            const pdfBuffer =
                await page.pdf({
                    format: "A4",
                    landscape: true,
                    printBackground: true,
                    preferCSSPageSize: true,
                    margin: {
                        top: 0,
                        right: 0,
                        bottom: 0,
                        left: 0
                    }
                });

            const fileName =
                `ZAWAM-Certificate-${certificate.certificate_id}.pdf`;

            res.setHeader(
                "Content-Type",
                "application/pdf"
            );

            res.setHeader(
                "Content-Disposition",
                `inline; filename="${fileName}"`
            );

            res.setHeader(
                "Content-Length",
                pdfBuffer.length
            );

            res.end(pdfBuffer);

        } catch (error) {
            console.error(
                "Certificate PDF error:",
                error
            );

            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message:
                        "حدث خطأ أثناء إنشاء ملف الشهادة",
                    error: error.message
                });
            }
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    console.error(
                        "Browser close error:",
                        closeError
                    );
                }
            }
        }
    }
);

// ============================================================
// GET USER CERTIFICATES
// ============================================================

app.get(
    "/api/certificates/:userId",
    async (req, res) => {
        try {
            const userId =
                Number(
                    req.params.userId
                );

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "معرف المستخدم غير صحيح"
                });
            }

            const [
                certificates
            ] = await db.query(
                `
                SELECT
                    cert.id,
                    cert.certificate_id,
                    cert.issued_at,
                    cert.user_id,
                    cert.course_id,
                    c.title AS course_title,
                    c.instructor
                FROM certificates cert
                INNER JOIN courses c
                    ON cert.course_id = c.id
                WHERE cert.user_id = ?
                ORDER BY cert.issued_at DESC
                `,
                [userId]
            );

            const formatted =
                certificates.map(
                    certificate => ({
                        ...certificate,

                        certificate_number:
                            certificate.certificate_id,

                        issue_date:
                            certificate.issued_at,

                        pdf_url:
                            `/api/certificate/${certificate.id}/pdf`
                    })
                );

            res.json({
                success: true,
                certificates:
                    formatted
            });
        } catch (error) {
            console.error(
                "User certificates error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل الشهادات",
                error: error.message
            });
        }
    }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
    (err, req, res, next) => {
        console.error(
            "Unhandled server error:",
            err
        );

        if (res.headersSent) {
            return next(err);
        }

        res.status(500).json({
            success: false,
            message:
                "حدث خطأ غير متوقع في الخادم",
            error: err.message
        });
    }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    () => {
        console.log(
            "========================================"
        );

        console.log(
            "       ZAWAM SERVER STARTED 🚀"
        );

        console.log(
            "========================================"
        );

        console.log(
            `Server: http://localhost:${PORT}`
        );

        console.log(
            `API:    http://localhost:${PORT}/api`
        );

        console.log(
            "========================================"
        );
    }
);