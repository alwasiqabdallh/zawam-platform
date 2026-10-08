// ================= LOGIN =================

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", async function (e) {

        e.preventDefault();

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        try {

            const response = await fetch("/api/login", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    email: email,
                    password: password
                })

            });

            const data = await response.json();

            if (!response.ok) {
                alert(data.message);
                return;
            }

            localStorage.setItem(
                "zawamLoggedIn",
                "true"
            );

            localStorage.setItem(
                "zawamUserName",
                data.user.name
            );

            localStorage.setItem(
                "zawamUserEmail",
                data.user.email
            );

            alert("تم تسجيل الدخول بنجاح 🎉");

            window.location.href = "index.html";

        } catch (error) {

            console.log("LOGIN ERROR:", error);

            alert("حدث خطأ في الاتصال بالسيرفر.");

        }

    });
}


// ================= REGISTER =================

const registerForm = document.getElementById("registerForm");

if (registerForm) {

    registerForm.addEventListener("submit", async function (e) {

        e.preventDefault();

        const name =
            document.getElementById("registerName").value.trim();

        const email =
            document.getElementById("registerEmail").value.trim();

        const password =
            document.getElementById("registerPassword").value;

        const confirmPassword =
            document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {

            alert("كلمتا المرور غير متطابقتين.");

            return;
        }

        try {

            const response = await fetch("/api/register", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    name: name,
                    email: email,
                    password: password
                })

            });

            const data = await response.json();

            if (!response.ok) {

                alert(data.message);

                return;
            }

            alert("تم إنشاء الحساب بنجاح 🎉");

            window.location.href = "login.html";

        } catch (error) {

            console.log("REGISTER ERROR:", error);

            alert("حدث خطأ في الاتصال بالسيرفر.");

        }

    });
}


// ================= GOOGLE =================

function googleLogin() {

    alert(
        "تسجيل الدخول باستخدام Google سيتم ربطه لاحقاً."
    );

}


// ================= FORGOT PASSWORD =================

function forgotPassword() {

    alert(
        "ميزة استعادة كلمة المرور سيتم إضافتها لاحقاً."
    );

}
// ================= USER STATUS =================

const authButtons = document.getElementById("authButtons");

if (authButtons) {

    const loggedIn = localStorage.getItem("zawamLoggedIn");
    const userName = localStorage.getItem("zawamUserName");

    if (loggedIn === "true" && userName) {

        authButtons.innerHTML = `
            <span style="margin-left:10px;">
                مرحباً، ${userName}
            </span>

            <button
                class="login-btn"
                onclick="logout()">
                تسجيل الخروج
            </button>
        `;

    }

}


// ================= LOGOUT =================

function logout() {

    localStorage.removeItem("zawamLoggedIn");
    localStorage.removeItem("zawamUserName");
    localStorage.removeItem("zawamUserEmail");

    window.location.href = "index.html";
}