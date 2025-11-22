const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const dotenv = require("dotenv");
const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes"); // Add this
const sponsorRoutes = require("./routes/sponsorRoutes");
const expressLayouts = require("express-ejs-layouts");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "superSecretKey123",
  resave: false,
  saveUninitialized: false,
}));

app.use(expressLayouts);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", false);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use("/", authRoutes);
app.use("/student", studentRoutes); // Add this line
app.use("/sponsor", sponsorRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));