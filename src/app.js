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

// Función mejorada para extraer public_id
function extractPublicId(imageUrl) {
  if (
    !imageUrl ||
    typeof imageUrl !== "string" ||
    !imageUrl.includes("cloudinary.com")
  ) {
    return null;
  }

  try {
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split("/");

    // Buscar el índice después de 'upload'
    const uploadIndex = pathParts.findIndex((part) => part === "upload");
    if (uploadIndex === -1 || uploadIndex >= pathParts.length - 1) {
      return null;
    }

    // Tomar las partes después de upload/v123456/
    const publicIdParts = pathParts.slice(uploadIndex + 2);
    const publicIdWithExtension = publicIdParts.join("/");

    // Eliminar la extensión del archivo si existe
    const lastDotIndex = publicIdWithExtension.lastIndexOf(".");
    return lastDotIndex === -1
      ? publicIdWithExtension
      : publicIdWithExtension.substring(0, lastDotIndex);
  } catch (error) {
    console.error("Error parsing Cloudinary URL:", error);
    return null;
  }
}

// Endpoint mejorado para eliminar imágenes
app.post("/delete-cloudinary-image", async (req, res) => {
  try {
    const { publicId } = req.body;

    // Validación más estricta
    if (!publicId || typeof publicId !== "string" || publicId.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "publicId válido es requerido",
        received: publicId,
      });
    }

    console.log("Intentando eliminar imagen con publicId:", publicId);

    // Opciones adicionales para mayor control
    const options = {
      invalidate: true, // Invalida la caché CDN
      resource_type: "image", // Asegura que es una imagen
    };

    const result = await cloudinary.uploader.destroy(publicId, options);

    console.log("Resultado de Cloudinary:", result);

    if (result.result !== "ok") {
      return res.status(404).json({
        success: false,
        error: "No se pudo eliminar la imagen",
        cloudinaryResult: result,
        suggestion:
          "Verifica que el publicId sea correcto y que la imagen exista",
      });
    }

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Error eliminando imagen:", {
      error: error.message,
      stack: error.stack,
      bodyReceived: req.body,
    });

    res.status(500).json({
      success: false,
      error: "Error interno al eliminar imagen",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Contacta al administrador",
    });
  }
});

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
//CrearCategorias
app.post("/create-category", async (req, res) => {
  try {
    const { nombre } = req.body;

    // Validaciones básicas
    if (!nombre) {
      return res.status(400).json({ error: "Error, categoria si nombre" });
    }

    const [result] = await pool.query(
      `INSERT INTO Categorias (nombre) 
       VALUES (?)`,
      [nombre]
    );

    res.status(201).json({
      id: result.insertId,
      message: "Categoria creada correctamente",
      ...req.body,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear categoria" });
  }
});

// CategoryDelete solo si no tiene elementos asignados
app.delete("/category/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si hay productos asociados a la categoría
    const [products] = await pool.query(
      "SELECT * FROM productos WHERE categoria = ?",
      [id]
    );

    if (products.length > 0) {
      return res.status(400).json({
        error:
          "No se puede eliminar la categoría porque hay productos asociados.",
      });
    }

    // Si no hay productos, eliminar la categoría
    const [result] = await pool.query("DELETE FROM Categorias WHERE id = ?", [
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    res.json({
      message: "Categoría eliminada correctamente",
      id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error:
        "No se puede eliminar la categoría porque hay productos asociados.",
    });
  }
});
app.get("/categories/with-product-count", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.id AS categoria_id,
        c.nombre AS categoria_nombre,
        COUNT(p.id_producto) AS total_productos
      FROM Categorias c
      LEFT JOIN productos p ON p.categoria = c.id
      GROUP BY c.id, c.nombre
      ORDER BY c.id
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Error al obtener los datos de las categorías" });
  }
});

// // Autenticación con Google
// const client = new OAuth2Client(
//   "667645070229-ghra1vmvapp3uqkiqlrsghiu68pcqkau.apps.googleusercontent.com"
// );

// app.post("/api/auth/google", async (req, res) => {
//   const { token } = req.body;

//   try {
//     const ticket = await client.verifyIdToken({
//       idToken: token,
//       audience:
//         "667645070229-ghra1vmvapp3uqkiqlrsghiu68pcqkau.apps.googleusercontent.com",
//     });

//     const payload = ticket.getPayload();
//     const { sub, email, name } = payload;

//     // Verifica si el usuario ya existe en la base de datos
//     const [user] = await pool.query("SELECT * FROM users WHERE google_id = ?", [
//       sub,
//     ]);

//     if (user.length === 0) {
//       // Si no existe, crea un nuevo usuario
//       const [result] = await pool.query(
//         "INSERT INTO users (google_id, email, name) VALUES (?, ?, ?)",
//         [sub, email, name]
//       );
//       res.json({ id: result.insertId, email, name });
//     } else {
//       // Si ya existe, devuelve la información del usuario
//       res.json(user[0]);
//     }
//   } catch (error) {
//     console.error(error);
//     res.status(400).json({ error: "Token inválido" });
//   }
// });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
