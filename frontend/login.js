document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
  
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const selectedRole = document.querySelector('input[name="role"]:checked').value;
  
    try {
      const response = await fetch("http://127.0.0.1:8080/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": "http://127.0.0.1:8080"
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, role: selectedRole }), // Include role in the request body
      });
  
      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        throw new Error("Server returned non-JSON response");
      }

      if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Invalid credentials. Please try again.");
        } else if (response.status === 500) {
            throw new Error("An error occurred on the server. Please try again later.");
        } else {
            throw new Error(`Login failed: ${response.statusText}`); 
        }
    }
  
      // Check if the selected role matches the user's actual role
      if ((selectedRole === 'admin' && !data.is_admin) || (selectedRole === 'user' && data.is_admin)) {
        alert("You cannot log in as a " + selectedRole + " with these credentials.");
        return; 
      }
  
      // Store user data and role in local storage
      localStorage.setItem("token", data.token);
      localStorage.setItem("userRole", data.is_admin ? 'admin' : 'user');
  
      // Redirect based on the selected role
      if (selectedRole === 'admin') {
        window.location.href = "http://127.0.0.1:8080/admin_dashboard"; 
      } else {
        window.location.href = "http://127.0.0.1:8080/user_dashboard"; 
      }
  
    } catch (error) {
      console.error("Login error:", error);
      alert(error.message || "Failed to login. Please check your credentials and try again.");
    }
});