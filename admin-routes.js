const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./db");

const router = express.Router();

/* =========================================================
   ADMIN SESSIONS
========================================================= */

const adminSessions = new Map();

/* =========================================================
   HELPERS
========================================================= */

function getToken(req) {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
        return null;
    }

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
            message: "جلسة الأدمن غير صالحة أو انتهت"
        });
    }

    req.admin = session;

    next();
}

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

/* =========================================================
   ADMIN LOGIN
========================================================= */

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
            SELECT
                id,
                name,
                email,
                password,
                role
            FROM users
            WHERE email = ?
              AND role = 'admin'
            LIMIT 1
            `,
            [email]
        );

        if (admins.length === 0) {
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
        console.error("ADMIN LOGIN ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "حدث خطأ في السيرفر أثناء تسجيل الدخول"
        });
    }
});

/* =========================================================
   ADMIN ME
========================================================= */

router.get("/me", requireAdmin, async (req, res) => {
    return res.json({
        success: true,
        admin: req.admin
    });
});

/* =========================================================
   ADMIN LOGOUT
========================================================= */

router.post("/logout", requireAdmin, async (req, res) => {
    const token = getToken(req);

    if (token) {
        adminSessions.delete(token);
    }

    return res.json({
        success: true,
        message: "تم تسجيل الخروج"
    });
});

/* =========================================================
   DASHBOARD
========================================================= */

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

        return res.json({
            success: true,
            stats: {
                courses: courses[0].count,
                lessons: lessons[0].count,
                users: users[0].count,
                certificates: certificates[0].count
            }
        });

    } catch (error) {
        console.error("DASHBOARD ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل بيانات لوحة التحكم"
        });
    }
});

/* =========================================================
   COURSES - GET
========================================================= */

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

        return res.json({
            success: true,
            courses
        });

    } catch (error) {
        console.error("GET COURSES ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل الدورات"
        });
    }
});

/* =========================================================
   COURSES - CREATE
========================================================= */

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
        console.error("CREATE COURSE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر إضافة الدورة"
        });
    }
});

/* =========================================================
   COURSES - UPDATE
========================================================= */

router.put("/courses/:id", requireAdmin, async (req, res) => {
    try {
        const courseId = Number(req.params.id);

        if (!courseId) {
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

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "الدورة غير موجودة"
            });
        }

        return res.json({
            success: true,
            message: "تم تحديث الدورة بنجاح"
        });

    } catch (error) {
        console.error("UPDATE COURSE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحديث الدورة"
        });
    }
});

/* =========================================================
   COURSES - DELETE
========================================================= */

router.delete("/courses/:id", requireAdmin, async (req, res) => {
    const connection = await db.getConnection();

    try {
        const courseId = Number(req.params.id);

        if (!courseId) {
            connection.release();

            return res.status(400).json({
                success: false,
                message: "رقم الدورة غير صحيح"
            });
        }

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

        if (result.affectedRows === 0) {
            await connection.rollback();
            connection.release();

            return res.status(404).json({
                success: false,
                message: "الدورة غير موجودة"
            });
        }

        await connection.commit();

        connection.release();

        return res.json({
            success: true,
            message: "تم حذف الدورة وجميع بياناتها المرتبطة"
        });

    } catch (error) {
        await connection.rollback();
        connection.release();

        console.error("DELETE COURSE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر حذف الدورة"
        });
    }
});

/* =========================================================
   LESSONS - GET ALL
========================================================= */

router.get("/lessons", requireAdmin, async (req, res) => {
    try {
        const [lessons] = await db.query(
            `
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
            LEFT JOIN courses c
                ON c.id = l.course_id
            ORDER BY
                l.course_id ASC,
                l.lesson_order ASC,
                l.id ASC
            `
        );

        return res.json({
            success: true,
            lessons
        });

    } catch (error) {
        console.error("GET LESSONS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل الدروس"
        });
    }
});

/* =========================================================
   LESSONS - GET BY COURSE
========================================================= */

router.get("/courses/:courseId/lessons", requireAdmin, async (req, res) => {
    try {
        const courseId = Number(req.params.courseId);

        if (!courseId) {
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
        console.error("GET COURSE LESSONS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل دروس الدورة"
        });
    }
});

/* =========================================================
   LESSONS - CREATE
========================================================= */

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

        const courseId = Number(course_id);

        if (!courseId) {
            return res.status(400).json({
                success: false,
                message: "يجب اختيار الدورة"
            });
        }

        if (!title || !String(title).trim()) {
            return res.status(400).json({
                success: false,
                message: "عنوان الدرس مطلوب"
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

        let order = Number(lesson_order);

        if (!order || order < 1) {
            const [last] = await db.query(
                `
                SELECT COALESCE(MAX(lesson_order), 0) AS max_order
                FROM lessons
                WHERE course_id = ?
                `,
                [courseId]
            );

            order = Number(last[0].max_order) + 1;
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
                description || "",
                video_url || "",
                duration || "",
                order
            ]
        );

        return res.status(201).json({
            success: true,
            message: "تمت إضافة الدرس بنجاح",
            lessonId: result.insertId
        });

    } catch (error) {
        console.error("CREATE LESSON ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر إضافة الدرس"
        });
    }
});

/* =========================================================
   LESSONS - UPDATE
========================================================= */

router.put("/lessons/:id", requireAdmin, async (req, res) => {
    try {
        const lessonId = Number(req.params.id);

        const {
            course_id,
            title,
            description,
            video_url,
            duration,
            lesson_order
        } = req.body;

        const courseId = Number(course_id);
        const order = Number(lesson_order);

        if (!lessonId || !courseId) {
            return res.status(400).json({
                success: false,
                message: "بيانات الدرس غير صحيحة"
            });
        }

        if (!title || !String(title).trim()) {
            return res.status(400).json({
                success: false,
                message: "عنوان الدرس مطلوب"
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
                String(title).trim(),
                description || "",
                video_url || "",
                duration || "",
                order > 0 ? order : 1,
                lessonId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "الدرس غير موجود"
            });
        }

        return res.json({
            success: true,
            message: "تم تحديث الدرس بنجاح"
        });

    } catch (error) {
        console.error("UPDATE LESSON ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحديث الدرس"
        });
    }
});

/* =========================================================
   LESSONS - DELETE
========================================================= */

router.delete("/lessons/:id", requireAdmin, async (req, res) => {
    try {
        const lessonId = Number(req.params.id);

        if (!lessonId) {
            return res.status(400).json({
                success: false,
                message: "رقم الدرس غير صحيح"
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

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "الدرس غير موجود"
            });
        }

        return res.json({
            success: true,
            message: "تم حذف الدرس بنجاح"
        });

    } catch (error) {
        console.error("DELETE LESSON ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر حذف الدرس"
        });
    }
});

/* =========================================================
   USERS
========================================================= */

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

        return res.json({
            success: true,
            users
        });

    } catch (error) {
        console.error("GET USERS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل المستخدمين"
        });
    }
});

/* =========================================================
   USER DELETE
========================================================= */

router.delete("/users/:id", requireAdmin, async (req, res) => {
    const connection = await db.getConnection();

    try {
        const userId = Number(req.params.id);

        if (!userId) {
            connection.release();

            return res.status(400).json({
                success: false,
                message: "رقم المستخدم غير صحيح"
            });
        }

        if (userId === req.admin.id) {
            connection.release();

            return res.status(400).json({
                success: false,
                message: "لا يمكنك حذف حساب الأدمن الحالي"
            });
        }

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

        if (result.affectedRows === 0) {
            await connection.rollback();
            connection.release();

            return res.status(404).json({
                success: false,
                message: "المستخدم غير موجود"
            });
        }

        await connection.commit();

        connection.release();

        return res.json({
            success: true,
            message: "تم حذف المستخدم"
        });

    } catch (error) {
        await connection.rollback();
        connection.release();

        console.error("DELETE USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر حذف المستخدم"
        });
    }
});

/* =========================================================
   CERTIFICATES
========================================================= */

router.get("/certificates", requireAdmin, async (req, res) => {
    try {
        const [certificates] = await db.query(
            `
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
            LEFT JOIN users u
                ON u.id = c.user_id
            LEFT JOIN courses co
                ON co.id = c.course_id
            ORDER BY c.id DESC
            `
        );

        return res.json({
            success: true,
            certificates
        });

    } catch (error) {
        console.error("GET CERTIFICATES ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل الشهادات"
        });
    }
});

/* =========================================================
   CERTIFICATE DELETE
========================================================= */

router.delete("/certificates/:id", requireAdmin, async (req, res) => {
    try {
        const certificateId = Number(req.params.id);

        if (!certificateId) {
            return res.status(400).json({
                success: false,
                message: "رقم الشهادة غير صحيح"
            });
        }

        const [result] = await db.query(
            "DELETE FROM certificates WHERE id = ?",
            [certificateId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "الشهادة غير موجودة"
            });
        }

        return res.json({
            success: true,
            message: "تم حذف الشهادة"
        });

    } catch (error) {
        console.error("DELETE CERTIFICATE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر حذف الشهادة"
        });
    }
});

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;