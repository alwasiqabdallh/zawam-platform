
// ============================================================
// ZAWAM ADMIN ROUTES
// ============================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./db");

const router = express.Router();

// ============================================================
// ADMIN SESSIONS
// ============================================================

const adminSessions = new Map();

// ============================================================
// HELPERS
// ============================================================

function getToken(req) {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) return null;

    return auth.substring(7).trim();
}

function requireAdmin(req, res, next) {
    const token = getToken(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "غير مصرح بالدخول"
        });
    }

    const session = adminSessions.get(token);

    if (!session) {
        return res.status(401).json({
            success: false,
            message: "جلسة الأدمن غير صالحة أو انتهت. سجّل الدخول مجددًا."
        });
    }

    req.admin = session;
    next();
}

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

function sendServerError(res, error, message) {
    console.error(message, error);

    return res.status(500).json({
        success: false,
        message: `${message}: ${error.sqlMessage || error.message || "خطأ غير معروف"}`
    });
}

// ============================================================
// ENSURE SPECIALTIES TABLE
// ============================================================

async function ensureSpecialtiesTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS specialties (
            id INT NOT NULL AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            description TEXT NOT NULL,
            icon VARCHAR(20) NOT NULL DEFAULT '📚',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY unique_specialty_name (name)
        ) ENGINE=InnoDB
          DEFAULT CHARSET=utf8mb4
          COLLATE=utf8mb4_unicode_ci
    `);
}

// ============================================================
// ADMIN LOGIN
// ============================================================

router.post("/login", async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال البريد الإلكتروني وكلمة المرور"
            });
        }

        const [admins] = await db.query(
            `
            SELECT id, name, email, password, role
            FROM users
            WHERE email = ?
              AND role = 'admin'
            LIMIT 1
            `,
            [email]
        );

        if (!admins.length) {
            return res.status(401).json({
                success: false,
                message: "بيانات الأدمن غير صحيحة"
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
                message: "بيانات الأدمن غير صحيحة"
            });
        }

        const token = createToken();

        adminSessions.set(token, {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role
        });

        return res.json({
            success: true,
            message: "تم تسجيل الدخول بنجاح",
            token,
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        return sendServerError(
            res,
            error,
            "حدث خطأ في السيرفر أثناء تسجيل الدخول"
        );
    }
});

// ============================================================
// ADMIN ME
// ============================================================

router.get("/me", requireAdmin, (req, res) => {
    return res.json({
        success: true,
        admin: req.admin
    });
});

// ============================================================
// ADMIN LOGOUT
// ============================================================

router.post("/logout", requireAdmin, (req, res) => {
    const token = getToken(req);

    if (token) adminSessions.delete(token);

    return res.json({
        success: true,
        message: "تم تسجيل الخروج"
    });
});

// ============================================================
// DASHBOARD
// ============================================================

router.get("/dashboard", requireAdmin, async (req, res) => {
    try {
        const [[courses]] = await db.query(
            "SELECT COUNT(*) AS count FROM courses"
        );

        const [[lessons]] = await db.query(
            "SELECT COUNT(*) AS count FROM lessons"
        );

        const [[users]] = await db.query(
            "SELECT COUNT(*) AS count FROM users"
        );

        const [[certificates]] = await db.query(
            "SELECT COUNT(*) AS count FROM certificates"
        );

        const totalCourses = Number(courses.count);
        const totalLessons = Number(lessons.count);
        const totalUsers = Number(users.count);
        const totalCertificates = Number(certificates.count);

        return res.json({
            success: true,
            stats: {
                courses: totalCourses,
                lessons: totalLessons,
                users: totalUsers,
                certificates: totalCertificates,

                totalCourses,
                totalLessons,
                totalUsers,
                totalCertificates,

                total_courses: totalCourses,
                total_lessons: totalLessons,
                total_users: totalUsers,
                total_certificates: totalCertificates
            }
        });
    } catch (error) {
        return sendServerError(
            res,
            error,
            "تعذر تحميل بيانات لوحة التحكم"
        );
    }
});

// ============================================================
// COURSES - GET
// ============================================================

router.get("/courses", requireAdmin, async (req, res) => {
    try {
        const [courses] = await db.query(`
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
        `);

        return res.json({
            success: true,
            courses
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر تحميل الدورات");
    }
});

// ============================================================
// COURSES - CREATE
// ============================================================

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
                (title, description, category, instructor, duration, image)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                String(title).trim(),
                description || "",
                category || "",
                instructor || "",
                duration || "",
                image || ""
            ]
        );

        return res.status(201).json({
            success: true,
            message: "تمت إضافة الدورة بنجاح",
            courseId: result.insertId
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر إضافة الدورة");
    }
});

// ============================================================
// COURSES - UPDATE
// ============================================================

router.put("/courses/:id", requireAdmin, async (req, res) => {
    try {
        const courseId = Number(req.params.id);

        if (!Number.isInteger(courseId) || courseId <= 0) {
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

        const [result] = await db.query(
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
                description || "",
                category || "",
                instructor || "",
                duration || "",
                image || "",
                courseId
            ]
        );

        if (!result.affectedRows) {
            const [existing] = await db.query(
                "SELECT id FROM courses WHERE id = ? LIMIT 1",
                [courseId]
            );

            if (!existing.length) {
                return res.status(404).json({
                    success: false,
                    message: "الدورة غير موجودة"
                });
            }
        }

        return res.json({
            success: true,
            message: "تم تحديث الدورة بنجاح"
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر تحديث الدورة");
    }
});

// ============================================================
// COURSES - DELETE
// ============================================================

router.delete("/courses/:id", requireAdmin, async (req, res) => {
    let connection;

    try {
        const courseId = Number(req.params.id);

        if (!Number.isInteger(courseId) || courseId <= 0) {
            return res.status(400).json({
                success: false,
                message: "رقم الدورة غير صحيح"
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query(
            "DELETE FROM progress WHERE course_id = ?",
            [courseId]
        );

        await connection.query(
            "DELETE FROM certificates WHERE course_id = ?",
            [courseId]
        );

        await connection.query(
            "DELETE FROM enrollments WHERE course_id = ?",
            [courseId]
        );

        await connection.query(
            "DELETE FROM lessons WHERE course_id = ?",
            [courseId]
        );

        const [result] = await connection.query(
            "DELETE FROM courses WHERE id = ?",
            [courseId]
        );

        if (!result.affectedRows) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "الدورة غير موجودة"
            });
        }

        await connection.commit();

        return res.json({
            success: true,
            message: "تم حذف الدورة والبيانات المرتبطة بها"
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("COURSE DELETE ROLLBACK ERROR:", rollbackError);
            }
        }

        return sendServerError(res, error, "تعذر حذف الدورة");
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// LESSONS - GET ALL
// ============================================================

router.get("/lessons", requireAdmin, async (req, res) => {
    try {
        const [lessons] = await db.query(`
            SELECT
                l.id,
                l.course_id,
                l.title,
                l.description,
                l.video_url,
                l.duration,
                l.lesson_order,
                l.created_at,
                c.title AS course_title
            FROM lessons l
            LEFT JOIN courses c ON c.id = l.course_id
            ORDER BY l.course_id ASC, l.lesson_order ASC, l.id ASC
        `);

        return res.json({
            success: true,
            lessons
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر تحميل المحاضرات");
    }
});

// ============================================================
// LESSONS - GET BY COURSE
// ============================================================

router.get(
    "/courses/:courseId/lessons",
    requireAdmin,
    async (req, res) => {
        try {
            const courseId = Number(req.params.courseId);

            if (!Number.isInteger(courseId) || courseId <= 0) {
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
                ORDER BY lesson_order ASC, id ASC
                `,
                [courseId]
            );

            return res.json({
                success: true,
                lessons
            });
        } catch (error) {
            return sendServerError(
                res,
                error,
                "تعذر تحميل محاضرات الدورة"
            );
        }
    }
);

// ============================================================
// LESSONS - CREATE HANDLER
// Supports both /lessons and /courses/:courseId/lessons
// ============================================================

async function createLesson(req, res) {
    try {
        const courseId = Number(
            req.params.courseId || req.body.course_id || req.body.courseId
        );

        const title = String(req.body.title || "").trim();
        const description = String(req.body.description || "").trim();
        const videoUrl = String(
            req.body.video_url || req.body.videoUrl || ""
        ).trim();

        const duration = req.body.duration ?? "";

        if (!Number.isInteger(courseId) || courseId <= 0) {
            return res.status(400).json({
                success: false,
                message: "يجب اختيار الدورة"
            });
        }

        if (!title) {
            return res.status(400).json({
                success: false,
                message: "عنوان المحاضرة مطلوب"
            });
        }

        const [courses] = await db.query(
            "SELECT id FROM courses WHERE id = ? LIMIT 1",
            [courseId]
        );

        if (!courses.length) {
            return res.status(404).json({
                success: false,
                message: "الدورة غير موجودة"
            });
        }

        const requestedOrder = Number(
            req.body.lesson_order ?? req.body.lessonOrder
        );

        let order;

        if (Number.isInteger(requestedOrder) && requestedOrder > 0) {
            order = requestedOrder;
        } else {
            const [[last]] = await db.query(
                `
                SELECT COALESCE(MAX(lesson_order), 0) AS max_order
                FROM lessons
                WHERE course_id = ?
                `,
                [courseId]
            );

            order = Number(last.max_order) + 1;
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
                title,
                description,
                videoUrl,
                duration,
                order
            ]
        );

        return res.status(201).json({
            success: true,
            message: "تمت إضافة المحاضرة بنجاح",
            lessonId: result.insertId,
            lesson: {
                id: result.insertId,
                course_id: courseId,
                title,
                description,
                video_url: videoUrl,
                duration,
                lesson_order: order
            }
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر إضافة المحاضرة");
    }
}

router.post("/lessons", requireAdmin, createLesson);

router.post(
    "/courses/:courseId/lessons",
    requireAdmin,
    createLesson
);

// ============================================================
// LESSONS - UPDATE
// ============================================================

router.put("/lessons/:id", requireAdmin, async (req, res) => {
    try {
        const lessonId = Number(req.params.id);

        const courseId = Number(
            req.body.course_id || req.body.courseId
        );

        const title = String(req.body.title || "").trim();
        const description = String(req.body.description || "").trim();
        const videoUrl = String(
            req.body.video_url || req.body.videoUrl || ""
        ).trim();

        const duration = req.body.duration ?? "";
        const order = Number(
            req.body.lesson_order || req.body.lessonOrder
        );

        if (!Number.isInteger(lessonId) || lessonId <= 0) {
            return res.status(400).json({
                success: false,
                message: "رقم المحاضرة غير صحيح"
            });
        }

        if (!Number.isInteger(courseId) || courseId <= 0) {
            return res.status(400).json({
                success: false,
                message: "يجب اختيار الدورة"
            });
        }

        if (!title) {
            return res.status(400).json({
                success: false,
                message: "عنوان المحاضرة مطلوب"
            });
        }

        const [result] = await db.query(
            `
            UPDATE lessons
            SET
                course_id = ?,
                title = ?,
                description = ?,
                video_url = ?,
                duration = ?,
                lesson_order = ?
            WHERE id = ?
            `,
            [
                courseId,
                title,
                description,
                videoUrl,
                duration,
                Number.isInteger(order) && order > 0 ? order : 1,
                lessonId
            ]
        );

        if (!result.affectedRows) {
            const [existing] = await db.query(
                "SELECT id FROM lessons WHERE id = ? LIMIT 1",
                [lessonId]
            );

            if (!existing.length) {
                return res.status(404).json({
                    success: false,
                    message: "المحاضرة غير موجودة"
                });
            }
        }

        return res.json({
            success: true,
            message: "تم تحديث المحاضرة بنجاح"
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر تحديث المحاضرة");
    }
});

// ============================================================
// LESSONS - DELETE
// ============================================================

router.delete("/lessons/:id", requireAdmin, async (req, res) => {
    try {
        const lessonId = Number(req.params.id);

        if (!Number.isInteger(lessonId) || lessonId <= 0) {
            return res.status(400).json({
                success: false,
                message: "رقم المحاضرة غير صحيح"
            });
        }

        await db.query(
            "DELETE FROM progress WHERE lesson_id = ?",
            [lessonId]
        );

        const [result] = await db.query(
            "DELETE FROM lessons WHERE id = ?",
            [lessonId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: "المحاضرة غير موجودة"
            });
        }

        return res.json({
            success: true,
            message: "تم حذف المحاضرة بنجاح"
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر حذف المحاضرة");
    }
});

// ============================================================
// USERS - GET
// ============================================================

router.get("/users", requireAdmin, async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT id, name, email, role, created_at
            FROM users
            ORDER BY id DESC
        `);

        return res.json({
            success: true,
            users
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر تحميل المستخدمين");
    }
});

// ============================================================
// USERS - DELETE
// ============================================================

router.delete("/users/:id", requireAdmin, async (req, res) => {
    let connection;

    try {
        const userId = Number(req.params.id);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                success: false,
                message: "رقم المستخدم غير صحيح"
            });
        }

        if (Number(userId) === Number(req.admin.id)) {
            return res.status(400).json({
                success: false,
                message: "لا يمكنك حذف حساب الأدمن الحالي"
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query(
            "DELETE FROM progress WHERE user_id = ?",
            [userId]
        );

        await connection.query(
            "DELETE FROM certificates WHERE user_id = ?",
            [userId]
        );

        await connection.query(
            "DELETE FROM enrollments WHERE user_id = ?",
            [userId]
        );

        const [result] = await connection.query(
            "DELETE FROM users WHERE id = ?",
            [userId]
        );

        if (!result.affectedRows) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        await connection.commit();

        return res.json({
            success: true,
            message: "تم حذف المستخدم بنجاح"
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("USER DELETE ROLLBACK ERROR:", rollbackError);
            }
        }

        return sendServerError(res, error, "تعذر حذف المستخدم");
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// CERTIFICATES - GET
// ============================================================

router.get("/certificates", requireAdmin, async (req, res) => {
    try {
        const [certificates] = await db.query(`
            SELECT
                c.id,
                c.certificate_id,
                c.user_id,
                c.course_id,
                c.issued_at,
                u.name AS user_name,
                u.email AS user_email,
                co.title AS course_title
            FROM certificates c
            LEFT JOIN users u ON u.id = c.user_id
            LEFT JOIN courses co ON co.id = c.course_id
            ORDER BY c.id DESC
        `);

        return res.json({
            success: true,
            certificates
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر تحميل الشهادات");
    }
});

// ============================================================
// CERTIFICATES - DELETE
// ============================================================

router.delete("/certificates/:id", requireAdmin, async (req, res) => {
    try {
        const certificateId = Number(req.params.id);

        if (!Number.isInteger(certificateId) || certificateId <= 0) {
            return res.status(400).json({
                success: false,
                message: "رقم الشهادة غير صحيح"
            });
        }

        const [result] = await db.query(
            "DELETE FROM certificates WHERE id = ?",
            [certificateId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: "الشهادة غير موجودة"
            });
        }

        return res.json({
            success: true,
            message: "تم حذف الشهادة بنجاح"
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر حذف الشهادة");
    }
});

// ============================================================
// SPECIALTIES - GET
// ============================================================

router.get("/specialties", requireAdmin, async (req, res) => {
    try {
        await ensureSpecialtiesTable();

        const [specialties] = await db.query(`
            SELECT id, name, description, icon, created_at
            FROM specialties
            ORDER BY id ASC
        `);

        return res.json({
            success: true,
            specialties
        });
    } catch (error) {
        return sendServerError(res, error, "تعذر تحميل التخصصات");
    }
});

// ============================================================
// SPECIALTIES - CREATE
// ============================================================

router.post("/specialties", requireAdmin, async (req, res) => {
    try {
        await ensureSpecialtiesTable();

        const name = String(req.body.name || "").trim();
        const description = String(req.body.description || "").trim();
        const icon = String(req.body.icon || "📚").trim();

        if (!name || !description) {
            return res.status(400).json({
                success: false,
                message: "أدخل اسم التخصص ووصفه."
            });
        }

        if (name.length > 100 || icon.length > 20) {
            return res.status(400).json({
                success: false,
                message: "اسم التخصص أو الأيقونة أطول من المسموح."
            });
        }

        const [existing] = await db.query(
            "SELECT id FROM specialties WHERE name = ? LIMIT 1",
            [name]
        );

        if (existing.length) {
            return res.status(409).json({
                success: false,
                message: "هذا التخصص موجود بالفعل."
            });
        }

        const [result] = await db.query(
            `
            INSERT INTO specialties (name, description, icon)
            VALUES (?, ?, ?)
            `,
            [name, description, icon]
        );

        return res.status(201).json({
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
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "هذا التخصص موجود بالفعل."
            });
        }

        return sendServerError(res, error, "تعذرت إضافة التخصص");
    }
});

// ============================================================
// EXPORT
// ============================================================

module.exports = router;
