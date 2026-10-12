const express = require("express");
const db = require("./db");

const router = express.Router();

const DEFAULT_CATEGORIES = [
    { name: "برمجة", icon: "💻", description: "تعلم البرمجة من الصفر وطوّر مهاراتك في تطوير المواقع والتطبيقات." },
    { name: "إنجليزي", icon: "🇬🇧", description: "طوّر مهاراتك في اللغة الإنجليزية بطريقة سهلة ومناسبة لمختلف المستويات." },
    { name: "تصميم", icon: "🎨", description: "تعلم أساسيات التصميم الجرافيكي وتصميم واجهات المواقع والتطبيقات." }
];

let readyPromise = null;

function ensureCategoriesTable() {
    if (!readyPromise) {
        readyPromise = (async () => {
            await db.query(`
                CREATE TABLE IF NOT EXISTS categories (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    icon VARCHAR(20) NOT NULL DEFAULT '📚',
                    description VARCHAR(500) NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_categories_name (name)
                ) DEFAULT CHARSET = utf8mb4
            `);

            const [rows] = await db.query("SELECT COUNT(*) AS count FROM categories");

            if (Number(rows[0].count) === 0) {
                for (const c of DEFAULT_CATEGORIES) {
                    await db.query(
                        "INSERT IGNORE INTO categories (name, icon, description) VALUES (?, ?, ?)",
                        [c.name, c.icon, c.description]
                    );
                }

                await db.query(`
                    INSERT IGNORE INTO categories (name)
                    SELECT DISTINCT TRIM(category)
                    FROM courses
                    WHERE category IS NOT NULL AND TRIM(category) <> ''
                `);
            }
        })().catch(error => {
            readyPromise = null;
            throw error;
        });
    }

    return readyPromise;
}

async function listCategories() {
    await ensureCategoriesTable();

    const [categories] = await db.query(
        "SELECT id, name, icon, description, created_at FROM categories ORDER BY id ASC"
    );

    const [counts] = await db.query(
        "SELECT category, COUNT(*) AS count FROM courses WHERE category IS NOT NULL GROUP BY category"
    );

    const countMap = new Map(
        counts.map(row => [String(row.category).trim(), Number(row.count)])
    );

    return categories.map(c => ({
        ...c,
        courses_count: countMap.get(c.name) || 0
    }));
}

router.get("/", async (req, res) => {
    try {
        const categories = await listCategories();
        res.json({ success: true, categories });
    } catch (error) {
        console.error("Categories error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحميل التخصصات",
            error: error.message
        });
    }
});

router.ensureCategoriesTable = ensureCategoriesTable;
router.listCategories = listCategories;

module.exports = router;
