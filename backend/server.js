const express = require("express");
const supabase = require("./supabase");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const app = express();

// macOS uses port 5000 for AirPlay Receiver; use another port (e.g. 5050) in dev.
const PORT = Number(process.env.PORT) || 5050;

const corsOptions = {
  origin: [
    "http://localhost:5173",
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

app.get("/categories", async (req, res) => {
  const { data, error } = await supabase.schema("shield_schema").from("categories").select("*");
  if (error) {
    console.error("Supabase Error:", error);
    return res.status(500).json({ error });
  }
  res.json(data);
});

//  POST /categories
app.post("/categories", async (req, res) => {
  const { code, name } = req.body;
  const { data, error } = await supabase.schema("shield_schema").from("categories").insert({ category_code: code, category_name: name });
  if (error) {
    console.error("Supabase Error:", error);
    return res.status(500).json({ error });
  }
  res.json(data);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));