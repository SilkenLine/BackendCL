import express from "express";
import { pool } from "./db.js";
import { PORT } from "./config.js";
import cors from "cors";

const app = express();
app.use(cors({
  origin: "*", // Permite cualquier dominio
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
// Middleware para parsear JSON
app.use(express.json());

app.get("/promo", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM productos ORDER BY precio ASC LIMIT 5"
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

app.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM productos");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});
app.get("/modal", async (req, res) => {
  try {
    const { id } = req.query; // Obtén el id de los parámetros de consulta
    const [rows] = await pool.query(
      "SELECT * FROM productos WHERE id_producto = ?", [id]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});
app.get("/category", async (req, res) => {
  try {
    const { categoria } = req.query; // Obtenemos la categoría de los parámetros de consulta
    const [rows] = await pool.query(
      "SELECT * FROM productos WHERE categoria = ?", 
      [categoria]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos por categoría" });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`); // Puerto dinámico
});
