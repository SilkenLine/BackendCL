import express from "express";
import { pool } from "./db.js";
import { PORT } from "./config.js";
import cors from "cors";
import { OAuth2Client } from "google-auth-library";

const app = express();

app.use(
  cors({
    origin: "*", // Permite cualquier dominio
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
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
      "SELECT * FROM productos WHERE id_producto = ?",
      [id]
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
app.get("/allcategory", async (req, res) => {
  try {
    const { categoria } = req.query; // Obtenemos la categoría de los parámetros de consulta
    const [rows] = await pool.query(
      "SELECT DISTINCT categoria FROM productos",
      [categoria]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos por categoría" });
  }
});
// Añade esto a tu app.js antes del app.listen
app.put("/api/update-product", async (req, res) => {
  console.log("Recibida solicitud PUT", req.body); // Para depuración

  try {
    const { id, nombre, descripcion, precio } = req.body;

    if (!id || !nombre || !descripcion || precio === undefined) {
      return res.status(400).json({
        error: "Datos incompletos",
        received: req.body,
      });
    }

    const [result] = await pool.query(
      "UPDATE productos SET nombre = ?, descripcion = ?, precio = ? WHERE id_producto = ?",
      [nombre, descripcion, precio, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json({
      success: true,
      message: "Producto actualizado correctamente",
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("Error en /api/update-product:", error);
    res.status(500).json({
      error: "Error al actualizar el producto",
      details: error.message,
    });
  }
});
//google
const client = new OAuth2Client(
  "667645070229-ghra1vmvapp3uqkiqlrsghiu68pcqkau.apps.googleusercontent.com"
);

app.post("/api/auth/google", async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience:
        "667645070229-ghra1vmvapp3uqkiqlrsghiu68pcqkau.apps.googleusercontent.com",
    });

    const payload = ticket.getPayload();
    const { sub, email, name } = payload;

    // Verifica si el usuario ya existe en la base de datos
    const [user] = await pool.query("SELECT * FROM users WHERE google_id = ?", [
      sub,
    ]);

    if (user.length === 0) {
      // Si no existe, crea un nuevo usuario
      const [result] = await pool.query(
        "INSERT INTO users (google_id, email, name) VALUES (?, ?, ?)",
        [sub, email, name]
      );
      res.json({ id: result.insertId, email, name });
    } else {
      // Si ya existe, devuelve la información del usuario
      res.json(user[0]);
    }
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Token inválido" });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`); // Puerto dinámico
});
