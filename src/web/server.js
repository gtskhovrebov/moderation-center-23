require("dotenv").config();

const express = require("express");
const path = require("path");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

app.use("/", dashboardRoutes);

app.listen(PORT, () => {
  console.log(`🌐 Web panel started: http://localhost:${PORT}`);
});