document.getElementById("register-form").addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("email");
    const password = document.getElementById("password");
    const confirmPassword = document.getElementById("confirm-password");

    // Validate if the fields are present in the DOM
    if (!email || !password || !confirmPassword) {
        alert("Form fields are missing. Please refresh the page.");
        return;
    }

    // Retrieve values and validate
    const emailValue = email.value.trim();
    const passwordValue = password.value.trim();
    const confirmPasswordValue = confirmPassword.value.trim();

    if (passwordValue !== confirmPasswordValue) {
        alert("Passwords do not match!");
        return;
    }

    try {
        const response = await fetch("http://localhost:8080/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailValue, password: passwordValue }),
        });

        if (response.status === 201) {
            alert("Registration successful! Redirecting to login page...");
            window.location.href = "index.html";
        } else {
            try {
                const errorData = await response.json();
                alert("Registration failed: " + errorData.message);
            } catch (jsonError) {
                const responseText = await response.text();
                alert("Registration failed: " + responseText);
            }
        }
    } catch (error) {
        console.error("Error during registration:", error);
        alert("An error occurred during registration.");
    }
});

// Add redirect link for users who already have an account
const loginLink = document.getElementById("login-link");
if (loginLink) {
    loginLink.addEventListener("click", function () {
        window.location.href = "index.html";
    });
}
