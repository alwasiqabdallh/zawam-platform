const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./db");

const router = express.Router();

/*
========================================
ADMIN SESSIONS
========================================
*/

const sessions = new Map();

function createSession(admin) {
    const token = crypto.randomBytes(32).toString("hex");

    sessions.set(token, {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        createdAt: Date.now()
    });

    return token;
}

function getSession(req) {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.substring(7);

    return sessions.get(token) || null;
}

function requireAdmin(req, res, next) {
    const session = getSession(req);

    if (!session) {
        return res.status(401).json({
            success: false,
            message: "غير مصرح لك. يرجى تسجيل الدخول كأدمن."
        });
    }

    req.admin = session;

    next();
}

/*
========================================
ADMIN LOGIN
========================================
*/

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "الرجاء إدخال البريد الإلكتروني وكلمة المرور"
            });
        }

        const cleanEmail = String(email)
            .trim()
            .toLowerCase();

        const [admins] = await db.query(
            `
            SELECT
                id,
                name,
                email,
                password,
                role
            FROM admins
            WHERE email = ?
            LIMIT 1
            `,
            [cleanEmail]
        );

        if (admins.length === 0) {
            return res.status(401).json({
                success: false,
                message: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            });
        }

        const admin = admins[0];

        const passwordMatch = await bcrypt.compare(
            password,
            admin.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            });
        }

        const token = createSession(admin);

        res.json({
            success: true,
            message: "تم تسجيل دخول الأدمن بنجاح",
            token,
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });

    } catch (error) {
        console.error("Admin login error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تسجيل الدخول",
            error: error.message
        });
    }
});

/*
========================================
ADMIN LOGOUT
========================================
*/

router.post("/logout", requireAdmin, (req, res) => {
    const authHeader = req.headers.authorization || "";

    if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        sessions.delete(token);
    }

    res.json({
        success: true,
        message: "تم تسجيل الخروج بنجاح"
    });
});

/*
========================================
CURRENT ADMIN
========================================
*/

router.get("/me", requireAdmin, (req, res) => {
    res.json({
        success: true,
        admin: req.admin
    });
});

/*
========================================
DASHBOARD
========================================
*/

router.get("/dashboard", requireAdmin, async (req, res) => {
    try {
        const [courses] = await db.query(
            "SELECT COUNT(*) AS count FROM courses"
        );

        const [lessons] = await db.query(
            "SELECT COUNT(*) AS count FROM lessons"
        );

        const [users] = await db.query(
            "SELECT COUNT(*) AS count FROM users"
        );

        const [certificates] = await db.query(
            "SELECT COUNT(*) AS count FROM certificates"
        );

        res.json({
            success: true,
            stats: {
                courses: Number(courses[0].count || 0),
                lessons: Number(lessons[0].count || 0),
                users: Number(users[0].count || 0),
                certificates: Number(
                    certificates[0].count || 0
                )
            }
        });

    } catch (error) {
        console.error("Admin dashboard error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل لوحة التحكم",
            error: error.message
        });
    }
});

/*
========================================
COURSES - GET
========================================
*/

router.get("/courses", requireAdmin, async (req, res) => {
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
        console.error("Admin courses error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل الدورات",
            error: error.message
        });
    }
});

/*
========================================
COURSES - CREATE
========================================
*/

router.post("/courses", requireAdmin, async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            instructor,
            duration,
            image
        } = req.body;

        if (!title || !String(title).trim()) {
            return res.status(400).json({
                success: false,
                message: "عنوان الدورة مطلوب"
            });
        }

        const [result] = await db.query(
            `
            INSERT INTO courses
            (
                title,
                description,
                category,
                instructor,
                duration,
                image
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                String(title).trim(),
                description || null,
                category || null,
                instructor || null,
                duration || null,
                image || null
            ]
        );

        res.status(201).json({
            success: true,
            message: "تمت إضافة الدورة بنجاح",
            course: {
                id: result.insertId,
                title: String(title).trim(),
                description: description || null,
                category: category || null,
                instructor: instructor || null,
                duration: duration || null,
                image: image || null
            }
        });

    } catch (error) {
        console.error("Create course error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء إضافة الدورة",
            error: error.message
        });
    }
});
/*
========================================
COURSES - UPDATE
========================================
*/

router.put(
    "/courses/:courseId",
    requireAdmin,
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
                    message: "رقم الدورة غير صحيح"
                });
            }

            const {
                title,
                description,
                category,
                instructor,
                duration,
                image
            } = req.body;

            if (!title || !String(title).trim()) {
                return res.status(400).json({
                    success: false,
                    message: "عنوان الدورة مطلوب"
                });
            }

            const [existing] = await db.query(
                `
                SELECT id
                FROM courses
                WHERE id = ?
                LIMIT 1
                `,
                [courseId]
            );

            if (existing.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "الدورة غير موجودة"
                });
            }

            await db.query(
                `
                UPDATE courses
                SET
                    title = ?,
                    description = ?,
                    category = ?,
                    instructor = ?,
                    duration = ?,
                    image = ?
                WHERE id = ?
                `,
                [
                    String(title).trim(),
                    description || null,
                    category || null,
                    instructor || null,
                    duration || null,
                    image || null,
                    courseId
                ]
            );

            res.json({
                success: true,
                message: "تم تعديل الدورة بنجاح"
            });

        } catch (error) {
            console.error("Update course error:", error);

            res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء تعديل الدورة",
                error: error.message
            });
        }
    }
);

/*
========================================
COURSES - DELETE
========================================
*/

router.delete(
    "/courses/:courseId",
    requireAdmin,
    async (req, res) => {
        let connection;

        try {
            const courseId =
                Number(req.params.courseId);

            if (
                !Number.isInteger(courseId) ||
                courseId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "رقم الدورة غير صحيح"
                });
            }

            connection =
                await db.getConnection();

            await connection.beginTransaction();

            const [courses] =
                await connection.query(
                    `
                    SELECT id
                    FROM courses
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [courseId]
                );

            if (courses.length === 0) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message: "الدورة غير موجودة"
                });
            }

            await connection.query(
                `
                DELETE FROM progress
                WHERE course_id = ?
                `,
                [courseId]
            );

            await connection.query(
                `
                DELETE FROM enrollments
                WHERE course_id = ?
                `,
                [courseId]
            );

            await connection.query(
                `
                DELETE FROM certificates
                WHERE course_id = ?
                `,
                [courseId]
            );

            await connection.query(
                `
                DELETE FROM lessons
                WHERE course_id = ?
                `,
                [courseId]
            );

            await connection.query(
                `
                DELETE FROM courses
                WHERE id = ?
                `,
                [courseId]
            );

            await connection.commit();

            res.json({
                success: true,
                message: "تم حذف الدورة وجميع بياناتها بنجاح"
            });

        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback();
                } catch (_) { }
            }

            console.error("Delete course error:", error);

            res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء حذف الدورة",
                error: error.message
            });

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

/*
========================================
LESSONS - GET BY COURSE
========================================
*/

router.get(
    "/courses/:courseId/lessons",
    requireAdmin,
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
                    message: "رقم الدورة غير صحيح"
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
                "Admin course lessons error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "حدث خطأ أثناء تحميل محاضرات الدورة",
                error: error.message
            });
        }
    }
);

/*
========================================
LESSONS - CREATE
========================================
*/

router.post("/lessons", requireAdmin, async (req, res) => {
    try {
        const {
            course_id,
            title,
            description,
            video_url,
            duration,
            lesson_order
        } = req.body;

        const courseId =
            Number(course_id);

        if (
            !Number.isInteger(courseId) ||
            courseId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "يجب اختيار دورة صحيحة"
            });
        }

        if (!title || !String(title).trim()) {
            return res.status(400).json({
                success: false,
                message: "عنوان المحاضرة مطلوب"
            });
        }

        const [courses] = await db.query(
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
                message: "الدورة غير موجودة"
            });
        }

        let order =
            Number(lesson_order);

        if (
            !Number.isInteger(order) ||
            order <= 0
        ) {
            const [lastLesson] =
                await db.query(
                    `
                    SELECT
                        COALESCE(
                            MAX(lesson_order),
                            0
                        ) AS max_order
                    FROM lessons
                    WHERE course_id = ?
                    `,
                    [courseId]
                );

            order =
                Number(
                    lastLesson[0].max_order || 0
                ) + 1;
        }

        const [result] = await db.query(
            `
            INSERT INTO lessons
            (
                course_id,
                title,
                description,
                video_url,
                duration,
                lesson_order
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                courseId,
                String(title).trim(),
                description || null,
                video_url || null,
                duration || null,
                order
            ]
        );

        res.status(201).json({
            success: true,
            message: "تمت إضافة المحاضرة بنجاح",
            lesson: {
                id: result.insertId,
                course_id: courseId,
                title: String(title).trim(),
                description: description || null,
                video_url: video_url || null,
                duration: duration || null,
                lesson_order: order
            }
        });

    } catch (error) {
        console.error("Create lesson error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء إضافة المحاضرة",
            error: error.message
        });
    }
});
/*
========================================
LESSONS - DELETE
========================================
*/

router.delete(
    "/lessons/:lessonId",
    requireAdmin,
    async (req, res) => {
        try {
            const lessonId =
                Number(req.params.lessonId);

            if (
                !Number.isInteger(lessonId) ||
                lessonId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "رقم المحاضرة غير صحيح"
                });
            }

            const [lessons] = await db.query(
                `
                SELECT id
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

            await db.query(
                `
                DELETE FROM progress
                WHERE lesson_id = ?
                `,
                [lessonId]
            );

            await db.query(
                `
                DELETE FROM lessons
                WHERE id = ?
                `,
                [lessonId]
            );

            res.json({
                success: true,
                message: "تم حذف المحاضرة بنجاح"
            });

        } catch (error) {
            console.error("Delete lesson error:", error);

            res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء حذف المحاضرة",
                error: error.message
            });
        }
    }
);

/*
========================================
USERS
========================================
*/

router.get("/users", requireAdmin, async (req, res) => {
    try {
        const [users] = await db.query(
            `
            SELECT
                id,
                name,
                email,
                role,
                created_at
            FROM users
            ORDER BY id DESC
            `
        );

        res.json({
            success: true,
            users
        });

    } catch (error) {
        console.error("Admin users error:", error);

        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل المستخدمين",
            error: error.message
        });
    }
});

/*
========================================
CERTIFICATES
========================================
*/

router.get(
    "/certificates",
    requireAdmin,
    async (req, res) => {
        try {
            const [certificates] =
                await db.query(
                    `
                    SELECT
                        c.id,
                        c.certificate_id
                            AS certificate_number,
                        c.user_id,
                        c.course_id,
                        c.issued_at,
                        u.name AS user_name,
                        u.email AS user_email,
                        co.title AS course_title
                    FROM certificates c
                    LEFT JOIN users u
                        ON c.user_id = u.id
                    LEFT JOIN courses co
                        ON c.course_id = co.id
                    ORDER BY c.id DESC
                    `
                );

            res.json({
                success: true,
                certificates
            });

        } catch (error) {
            console.error(
                "Admin certificates error:",
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
// ========================================
// SPECIALTIES - GET
// ========================================

router.get("/specialties", requireAdmin, async (req, res) => {
    try {
        const [specialties] = await db.query(`
            SELECT id, name, description, icon, created_at
            FROM specialties
            ORDER BY id ASC
        `);

        res.json({
            success: true,
            specialties
        });
    } catch (error) {
        console.error("Load specialties error:", error);

        res.status(500).json({
            success: false,
            message: "تعذر تحميل التخصصات."
        });
    }
});

// ========================================
// SPECIALTIES - CREATE
// ========================================

router.post("/specialties", requireAdmin, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const description = String(req.body.description || "").trim();
        const icon = String(req.body.icon || "📚").trim();

        if (!name || !description) {
            return res.status(400).json({
                success: false,
                message: "اسم التخصص والوصف مطلوبان."
            });
        }

        const [existing] = await db.query(
            "SELECT id FROM specialties WHERE name = ? LIMIT 1",
            [name]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "التخصص موجود بالفعل."
            });
        }

        const [result] = await db.query(
            `INSERT INTO specialties (name, description, icon)
             VALUES (?, ?, ?)`,
            [name, description, icon]
        );

        res.status(201).json({
            success: true,
            message: "تمت إضافة التخصص بنجاح.",
            specialty: {
                id: result.insertId,
                name,
                description,
                icon
            }
        });
    } catch (error) {
        console.error("Add specialty error:", error);

        res.status(500).json({
            success: false,
            message: "تعذرت إضافة التخصص."
        });
    }
});
module.exports = router;
