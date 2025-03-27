import express from "express";
import { pool } from "./db.js";
import { PORT } from "./config.js";
import cors from "cors";
import { OAuth2Client } from "google-auth-library";
import { v2 as cloudinary } from "cloudinary";

const app = express();

// Configuración de Cloudinary con tus credenciales
cloudinary.config({
  cloud_name: "dxkoujebx",
  api_key: "191512298222633",
  api_secret: "KqBGs5GOtaDtx0w2lVYACQ3cGPw",
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Función para extraer el public_id de la URL de Cloudinary
function extractPublicId(imageUrl) {
  if (!imageUrl || !imageUrl.includes("cloudinary.com")) return null;

  const parts = imageUrl.split("/");
  const uploadIndex = parts.findIndex((part) => part === "upload") + 1;
  const publicIdWithExtension = parts.slice(uploadIndex + 1).join("/");
  const publicId = publicIdWithExtension.split(".")[0];
  return publicId;
}

// Endpoints existentes
app.get("/promo", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM productos WHERE disponible=1 ORDER BY precio ASC LIMIT 5"
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

app.get("/allcategories", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM Categorias");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener categorias" });
  }
});

app.get("/modal", async (req, res) => {
  try {
    const { id } = req.query;
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
    const { categoria } = req.query;
    const [rows] = await pool.query(
      "SELECT * FROM productos WHERE categoria = ? AND disponible=1",
      [categoria]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos por categoría" });
  }
});

app.get("/admin", async (req, res) => {
  try {
    const { categoria } = req.query;
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
    const { categoria } = req.query;
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

// PUT (Actualizar) producto
app.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, categoria, precio, disponible, imagen_url } =
      req.body;

    const [result] = await pool.query(
      `UPDATE productos SET 
       nombre = ?, descripcion = ?, categoria = ?, 
       precio = ?, disponible = ?, imagen_url = ?
       WHERE id_producto = ?`,
      [nombre, descripcion, categoria, precio, disponible, imagen_url, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json({
      message: "Producto actualizado correctamente",
      id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar el producto" });
  }
});

// DELETE modificado para eliminar también de Cloudinary
app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Obtener el producto para conseguir la URL de la imagen
    const [product] = await pool.query(
      "SELECT * FROM productos WHERE id_producto = ?",
      [id]
    );

    if (product.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    const productData = product[0];
    const imageUrl = productData.imagen_url;

    // 2. Si tiene imagen en Cloudinary, eliminarla
    if (imageUrl) {
      const publicId = extractPublicId(imageUrl);
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
          console.log(`Imagen ${publicId} eliminada de Cloudinary`);
        } catch (cloudinaryError) {
          console.error(
            "Error eliminando imagen de Cloudinary:",
            cloudinaryError
          );
          // Continuamos aunque falle la eliminación en Cloudinary
        }
      }
    }

    // 3. Eliminar el producto de la base de datos
    const [result] = await pool.query(
      "DELETE FROM productos WHERE id_producto = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json({
      message: "Producto e imagen eliminados correctamente",
      id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al eliminar el producto" });
  }
});

// CREATE producto
app.post("/products", async (req, res) => {
  try {
    const { nombre, descripcion, categoria, precio, disponible, imagen_url } =
      req.body;

    // Validaciones básicas
    if (!nombre || !categoria || precio === undefined) {
      return res
        .status(400)
        .json({ error: "Nombre, categoría y precio son obligatorios" });
    }

    const [result] = await pool.query(
      `INSERT INTO productos (nombre, descripcion, categoria, precio, disponible, imagen_url) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, descripcion, categoria, precio, disponible, imagen_url]
    );

    res.status(201).json({
      id: result.insertId,
      message: "Producto creado correctamente",
      ...req.body,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear el producto" });
  }
});

// Autenticación con Google
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
  console.log(`Server running on port ${PORT}`);
});
