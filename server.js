const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-local-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 2
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "hotel_booking",
  waitForConnections: true,
  connectionLimit: 10
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ message: "Backend and MySQL connected successfully!" });
  } catch (error) {
    console.error("Database error:", error.message);
    res.status(500).json({ message: "Database connection failed. Check .env settings." });
  }
});

app.get("/api/rooms", async (req, res) => {
  try {
    const [rooms] = await pool.query(
      "SELECT id, room_name, description, price, capacity, image_url FROM rooms ORDER BY price"
    );
    res.json(rooms);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load rooms." });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;

    if (!full_name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must contain at least 8 characters." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      "INSERT INTO users (full_name, email, phone, password) VALUES (?, ?, ?, ?)",
      [full_name.trim(), email.trim().toLowerCase(), phone?.trim() || null, hashedPassword]
    );

    req.session.user = {
      id: result.insertId,
      full_name: full_name.trim(),
      email: email.trim().toLowerCase(),
      role: "customer"
    };

    res.status(201).json({ message: "Registration successful!", user: req.session.user });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "This email is already registered." });
    }
    console.error(error);
    res.status(500).json({ message: "Registration failed." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Enter your email and password." });
    }

    const [users] = await pool.execute(
      "SELECT id, full_name, email, password, role FROM users WHERE email = ?",
      [email.trim().toLowerCase()]
    );

    if (!users.length || !(await bcrypt.compare(password, users[0].password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = users[0];

    req.session.regenerate((error) => {
      if (error) {
        return res.status(500).json({ message: "Could not create login session." });
      }

      req.session.user = {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      };

      res.json({ message: "Login successful!", user: req.session.user });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Login failed." });
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Please log in." });
  }
  res.json({ user: req.session.user });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ message: "Logout failed." });
    }
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out successfully." });
  });
});

app.post("/api/bookings", async (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ message: "Please log in before booking." });
  }

  const { room_id, check_in, check_out, guests } = req.body;
  const roomId = Number(room_id);
  const guestCount = Number(guests);

  if (
    !Number.isInteger(roomId) || roomId < 1 ||
    !Number.isInteger(guestCount) || guestCount < 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(check_in || "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(check_out || "")
  ) {
    return res.status(400).json({ message: "Enter valid room, guest and date details." });
  }

  const start = new Date(`${check_in}T00:00:00Z`);
  const end = new Date(`${check_out}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start.toISOString().slice(0, 10) !== check_in ||
    end.toISOString().slice(0, 10) !== check_out ||
    start < today || end <= start
  ) {
    return res.status(400).json({ message: "Check-in must be today or later, and check-out must be after check-in." });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rooms] = await connection.execute(
      "SELECT id, price, capacity FROM rooms WHERE id = ? FOR UPDATE",
      [roomId]
    );

    if (!rooms.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Room not found." });
    }

    const room = rooms[0];

    if (guestCount > room.capacity) {
      await connection.rollback();
      return res.status(400).json({ message: `This room accommodates up to ${room.capacity} guests.` });
    }

    const [conflicts] = await connection.execute(
      `SELECT id FROM bookings
       WHERE room_id = ? AND status = 'Confirmed'
       AND check_in < ? AND check_out > ?
       LIMIT 1`,
      [roomId, check_out, check_in]
    );

    if (conflicts.length) {
      await connection.rollback();
      return res.status(409).json({ message: "This room is already booked for those dates." });
    }

    const nights = Math.round((end - start) / 86400000);
    const total = Number(room.price) * nights;
    const bookingCode = "LS" + Date.now() + Math.floor(Math.random() * 1000);

    await connection.execute(
      `INSERT INTO bookings
       (booking_code, user_id, room_id, check_in, check_out, guests, total_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [bookingCode, user.id, roomId, check_in, check_out, guestCount, total]
    );

    await connection.commit();

    res.status(201).json({
      message: "Your room has been booked successfully!",
      booking_code: bookingCode,
      nights,
      total_price: total
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Booking failed. Please try again." });
  } finally {
    if (connection) connection.release();
  }
});


app.get("/api/bookings", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Please log in." });
  }

  try {
    const [bookings] = await pool.execute(
      `SELECT
          b.id,
          b.booking_code,
          b.check_in,
          b.check_out,
          b.guests,
          b.total_price,
          b.status,
          r.room_name,
          r.image_url,
          r.location
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       WHERE b.user_id = ?
       ORDER BY b.id DESC`,
      [req.session.user.id]
    );

    res.json(bookings);
  } catch (error) {
    console.error("Booking history error:", error);
    res.status(500).json({
      message: "Could not load booking history."
    });
  }
});


app.post("/api/bookings/:id/cancel", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Please log in." });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE bookings SET status = 'Cancelled'
       WHERE id = ? AND user_id = ? AND status = 'Confirmed' AND check_in > CURDATE()`,
      [req.params.id, req.session.user.id]
    );

    if (!result.affectedRows) {
      return res.status(400).json({ message: "Booking not found or cannot be cancelled." });
    }

    res.json({ message: "Booking cancelled successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Cancellation failed." });
  }
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    app.listen(PORT, () => {
      console.log(`LuxeStay is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Could not connect to MySQL. Check your .env file.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();