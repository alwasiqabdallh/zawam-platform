const db = require("./db");

async function checkAdmin() {
    try {
        const [rows] = await db.query(
            "SELECT id, name, email, role FROM users WHERE role = 'admin'"
        );

        console.table(rows);

        process.exit(0);

    } catch (error) {

        console.error(error);

        process.exit(1);
    }
}

checkAdmin();