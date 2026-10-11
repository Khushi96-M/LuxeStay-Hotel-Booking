// =====================================
// LuxeStay Hotel Booking Website
// =====================================

const $ = (id) => document.getElementById(id);

let currentUser = null;
let rooms = [];
let authMode = "login";
let selectedRoom = null;
let toastTimer;

// Show notification
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

// API request helper
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }

  return data;
}

// Date helpers
function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function setDateMinimums() {
  const today = localDateString(new Date());

  ["searchCheckin", "checkIn"].forEach(id => {
    $(id).min = today;
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  ["searchCheckout", "checkOut"].forEach(id => {
    $(id).min = localDateString(tomorrow);
  });
}

// Format price in Indian rupees
function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

// Protect HTML output
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Load hotel rooms
async function loadRooms() {
  const grid = $("roomsGrid");

  try {
    rooms = await api("/api/rooms");

    if (!rooms.length) {
      grid.innerHTML = "<p>No rooms are available at the moment.</p>";
      return;
    }

    grid.innerHTML = rooms.map((room, index) => `
      <article class="room-card" data-room-id="${Number(room.id)}">
        <div class="room-image">
          <img
            src="${escapeHTML(room.image_url || "")}"
            alt="${escapeHTML(room.room_name)}"
            loading="lazy"
            onerror="this.onerror=null;this.src='https://placehold.co/900x600/f3efe7/615b50?text=Luxury+Hotel+Room'"
          >
          <span class="room-tag">
            ${index === 0 ? "COMFORT PICK" :
              index === 1 ? "GUEST FAVOURITE" : "PREMIUM STAY"}
          </span>
        </div>

        <div class="room-info">
          <h3>${escapeHTML(room.room_name)}</h3>
          <p>${escapeHTML(room.description || "A comfortable room for your stay.")}</p>

          <div class="room-bottom">
            <div class="room-price">
              ${formatPrice(Number(room.price))}
              <small>
                per night · Up to ${Number(room.capacity)} guests
              </small>
            </div>

            <button
              class="btn btn-dark book-room"
              data-id="${Number(room.id)}"
            >
              Book Now ↗
            </button>
          </div>

          <div class="room-capacity">
            Thoughtfully designed for your comfort
          </div>
        </div>
      </article>
    `).join("");

  } catch (error) {
    grid.innerHTML = `
      <p>
        Unable to load rooms. Please check that the server and database
        are running, then refresh.
      </p>
    `;

    console.error(error);
  }
}

// Open and close modals
function openModal(id) {
  $(id).classList.remove("hidden");
}

function closeModal(id) {
  $(id).classList.add("hidden");
}

// Login or registration modal
function openAuth(mode) {
  authMode = mode;
  $("authForm").reset();
  $("authMessage").textContent = "";

  const registering = mode === "register";

  $("authTitle").textContent = registering
    ? "Create your account"
    : "Welcome back";

  $("authSubtitle").textContent = registering
    ? "Join LuxeStay and plan your next getaway."
    : "Sign in to manage your stay.";

  $("nameField").classList.toggle("hidden", !registering);
  $("phoneField").classList.toggle("hidden", !registering);

  $("fullName").required = registering;
  $("password").autocomplete = registering
    ? "new-password"
    : "current-password";

  $("authSubmit").textContent = registering
    ? "Create Account"
    : "Login";

  $("switchText").textContent = registering
    ? "Already have an account?"
    : "New to LuxeStay?";

  $("switchAuth").textContent = registering
    ? "Login"
    : "Create an account";

  openModal("authModal");
}

// Update navbar according to login status
function updateNavigation() {
  const loggedIn = Boolean(currentUser);

  $("loginBtn").classList.toggle("hidden", loggedIn);
  $("registerBtn").classList.toggle("hidden", loggedIn);
  $("dashboardBtn").classList.toggle("hidden", !loggedIn);
  $("historyBtn").classList.toggle("hidden", !loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
}

// Check whether a user is logged in
async function checkSession() {
  try {
    const result = await api("/api/me");
    currentUser = result.user;
  } catch {
    currentUser = null;
  }

  updateNavigation();
}

// Navbar button events
$("loginBtn").addEventListener("click", () => {
  openAuth("login");
});

$("registerBtn").addEventListener("click", () => {
  openAuth("register");
});

$("switchAuth").addEventListener("click", () => {
  openAuth(authMode === "login" ? "register" : "login");
});

$("closeModal").addEventListener("click", () => {
  closeModal("authModal");
});

$("closeBooking").addEventListener("click", () => {
  closeModal("bookingModal");
});

$("closeDashboard").addEventListener("click", () => {
  closeModal("dashboardModal");
});

// Close modal when clicking outside its card
["authModal", "bookingModal", "dashboardModal"].forEach(id => {
  $(id).addEventListener("click", event => {
    if (event.target === $(id)) {
      closeModal(id);
    }
  });
});

// Login and registration form
$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("authSubmit");
  button.disabled = true;
  $("authMessage").textContent = "";

  try {
    const registering = authMode === "register";

    const body = {
      email: $("email").value.trim(),
      password: $("password").value
    };

    if (registering) {
      body.full_name = $("fullName").value.trim();
      body.phone = $("phone").value.trim();
    }

    const result = await api(
      registering ? "/api/register" : "/api/login",
      {
        method: "POST",
        body: JSON.stringify(body)
      }
    );

    currentUser = result.user;
    updateNavigation();
    closeModal("authModal");
    showToast(result.message);

    if (selectedRoom) {
      openBooking(selectedRoom.id);
    }

  } catch (error) {
    $("authMessage").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

// Logout function
async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });

    currentUser = null;
    updateNavigation();
    closeModal("dashboardModal");

    showToast("You have logged out successfully.");

  } catch (error) {
    showToast(error.message);
  }
}

$("logoutBtn").addEventListener("click", logout);
$("dashboardLogout").addEventListener("click", logout);

// Open booking form for selected room
function openBooking(roomId) {
  selectedRoom = rooms.find(
    room => Number(room.id) === Number(roomId)
  );

  if (!selectedRoom) {
    showToast("Please select a valid room.");
    return;
  }

  if (!currentUser) {
    openAuth("login");
    showToast("Please log in to book your stay.");
    return;
  }

  $("bookingRoomId").value = selectedRoom.id;
  $("bookingRoomName").textContent = selectedRoom.room_name;

  $("bookingRoomPrice").textContent =
    `${formatPrice(Number(selectedRoom.price))} per night`;

  $("checkIn").value = $("searchCheckin").value || "";
  $("checkOut").value = $("searchCheckout").value || "";
  $("guests").value = $("searchGuests").value || "2";

  $("bookingMessage").textContent = "";

  updatePriceEstimate();
  openModal("bookingModal");
}

// Handle Book Now buttons
$("roomsGrid").addEventListener("click", event => {
  const button = event.target.closest(".book-room");

  if (button) {
    openBooking(button.dataset.id);
  }
});

// Calculate booking price
function updatePriceEstimate() {
  if (!selectedRoom) return;

  const startValue = $("checkIn").value;
  const endValue = $("checkOut").value;

  if (!startValue || !endValue) {
    $("priceEstimate").textContent =
      "Select your dates to estimate the total.";
    return;
  }

  const start = new Date(`${startValue}T00:00:00`);
  const end = new Date(`${endValue}T00:00:00`);

  const nights = Math.round((end - start) / 86400000);

  if (nights < 1) {
    $("priceEstimate").textContent =
      "Check-out must be after check-in.";
    return;
  }

  $("priceEstimate").textContent =
    `${nights} night(s) · Estimated total: ${
      formatPrice(nights * Number(selectedRoom.price))
    }`;
}

// Check-in date changes
$("checkIn").addEventListener("change", () => {
  const start = $("checkIn").value;

  if (start) {
    const nextDay = new Date(`${start}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);

    $("checkOut").min = localDateString(nextDay);

    if ($("checkOut").value && $("checkOut").value <= start) {
      $("checkOut").value = "";
    }
  }

  updatePriceEstimate();
});

$("checkOut").addEventListener("change", updatePriceEstimate);

// Search button: dates and location
$("searchBtn").addEventListener("click", () => {
  const start = $("searchCheckin").value;
  const end = $("searchCheckout").value;

  if (
    (start && !end) ||
    (!start && end) ||
    (start && end && end <= start)
  ) {
    showToast("Please select valid check-in and check-out dates.");
    return;
  }

  if (start) {
    $("checkIn").value = start;
    $("checkOut").value = end;
  }

  const destination = $("locationSearch").value.trim().toLowerCase();
  const roomCards = $("roomsGrid").querySelectorAll(".room-card");

  let count = 0;

  roomCards.forEach(card => {
    const room = rooms.find(
      item => Number(item.id) === Number(card.dataset.roomId)
    );

    const roomLocation = String(room?.location || "Pune").toLowerCase();
    const matches = !destination || roomLocation.includes(destination);

    card.style.display = matches ? "" : "none";

    if (matches) count++;
  });

  if (count === 0) {
    showToast("No rooms found. Try Pune, Mumbai or Goa.");
  } else {
    showToast(`${count} room(s) found!`);
  }

  document.querySelector("#rooms").scrollIntoView({
    behavior: "smooth"
  });
});

// Confirm booking
$("bookingForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  button.disabled = true;
  $("bookingMessage").textContent = "";

  try {
    const result = await api("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        room_id: Number($("bookingRoomId").value),
        check_in: $("checkIn").value,
        check_out: $("checkOut").value,
        guests: Number($("guests").value)
      })
    });

    closeModal("bookingModal");

    showToast(
      `${result.message} Booking ID: ${result.booking_code}`
    );

    // Automatically show booking history after booking
    await showDashboard();

  } catch (error) {
    $("bookingMessage").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

// Display user's booking history
async function showDashboard() {
  if (!currentUser) {
    openAuth("login");
    showToast("Please log in to view your booking history.");
    return;
  }

  $("dashboardWelcome").textContent =
    `Welcome, ${currentUser.full_name}. Here are your reservations.`;

  $("myBookings").innerHTML =
    '<p class="empty-bookings">Loading your bookings...</p>';

  openModal("dashboardModal");

  try {
    const bookings = await api("/api/bookings");

    if (!bookings.length) {
      $("myBookings").innerHTML = `
        <p class="empty-bookings">
          No bookings yet. Explore our rooms and plan your next stay.
        </p>
      `;
      return;
    }

    $("myBookings").innerHTML = bookings.map(booking => `
      <article class="booking-item">
        <h3>${escapeHTML(booking.room_name)}</h3>

        <p>
          Booking ID: ${escapeHTML(booking.booking_code)}
        </p>

        <p>
          Check-in: ${escapeHTML(booking.check_in)}
          · Check-out: ${escapeHTML(booking.check_out)}
        </p>

        <p>
          Guests: ${Number(booking.guests)}
          · Total: ${formatPrice(Number(booking.total_price))}
        </p>

        <span
          class="booking-status"
          style="${
            booking.status === "Cancelled"
              ? "background:#fbe8e8;color:#963333"
              : ""
          }"
        >
          ${escapeHTML(booking.status)}
        </span>

        ${
          booking.status === "Confirmed"
            ? `<br>
               <button
                 class="cancel-btn"
                 data-cancel-id="${Number(booking.id)}"
               >
                 Cancel Booking
               </button>`
            : ""
        }
      </article>
    `).join("");

  } catch (error) {
    $("myBookings").innerHTML = `
      <p class="empty-bookings">
        ${escapeHTML(error.message)}
      </p>
    `;
  }
}

// My Account and Booking History buttons
$("dashboardBtn").addEventListener("click", showDashboard);
$("historyBtn").addEventListener("click", showDashboard);

// Cancel booking
$("myBookings").addEventListener("click", async event => {
  const button = event.target.closest("[data-cancel-id]");

  if (!button) return;

  if (!confirm("Are you sure you want to cancel this booking?")) {
    return;
  }

  button.disabled = true;

  try {
    const result = await api(
      `/api/bookings/${button.dataset.cancelId}/cancel`,
      { method: "POST" }
    );

    showToast(result.message);
    await showDashboard();

  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

// Add location search input
(function setupLocationSearch() {
  const searchButton = $("searchBtn");

  if (!searchButton) return;

  const locationBox = document.createElement("input");

  locationBox.type = "text";
  locationBox.id = "locationSearch";
  locationBox.placeholder = "📍 Enter destination (e.g. Pune)";
  locationBox.setAttribute("aria-label", "Search room location");

  locationBox.style.cssText = `
    padding: 13px 16px;
    border: 1px solid #d8cbb7;
    border-radius: 10px;
    width: 220px;
    max-width: 100%;
    font-size: 14px;
    margin: 8px;
    outline-color: #b99762;
  `;

  searchButton.parentNode.insertBefore(
    locationBox,
    searchButton
  );
})();

// Start website
async function init() {
  setDateMinimums();

  await Promise.all([
    loadRooms(),
    checkSession()
  ]);
}

init();