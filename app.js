const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const dotenv = require("dotenv");
const authRoutes = require("./backend/routes/authRoutes");
const studentRoutes = require("./backend/routes/studentRoutes");
const sponsorRoutes = require("./backend/routes/sponsorRoutes");
const adminRoutes = require("./backend/routes/adminRoutes");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for Render.com (must be before session)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(session({
  secret: process.env.SESSION_SECRET || "superSecretKey123",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "frontend/views"));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, 'frontend/public')));
app.use('/uploads', express.static(path.join(__dirname, 'backend/uploads')));

// Routes
app.use("/", authRoutes);
app.use("/student", studentRoutes);
app.use("/sponsor", sponsorRoutes);
app.use("/admin", adminRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));