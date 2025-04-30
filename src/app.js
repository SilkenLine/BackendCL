import express from "express";
import { pool } from "./db.js";
import { PORT } from "./config.js";
import cors from "cors";
import { OAuth2Client } from "google-auth-library";
import { v2 as cloudinary } from "cloudinary";
import { pool as db } from "./db.js";

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
//actualizar posicion de categorias
app.post("/categories/update-order", async (req, res) => {
  const newOrder = req.body; // [{ id: 1, orden: 1 }, { id: 2, orden: 2 }, ...]

  if (!Array.isArray(newOrder)) {
    return res
      .status(400)
      .json({ message: "El formato enviado no es correcto" });
  }

  try {
    for (let cat of newOrder) {
      // Asegúrate de proteger contra SQL Injection si no usas un ORM.
      await db.query("UPDATE Categorias SET orden = ? WHERE id = ?", [
        cat.orden,
        cat.id,
      ]);
    }
    res.status(200).json({ message: "Orden actualizado correctamente" });
  } catch (error) {
    console.error("Error al actualizar orden:", error);
    res.status(500).json({ message: "Error actualizando orden" });
  }
});

//Obetner categorias ordenadas
app.get("/category-asc", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "select * from Categorias order by orden asc"
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener categorias" });
  }
});
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
app.get("/crepa-combo", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "select * from productos where combo!=1 || combo IS NULL && categoria=1 || categoria=2 order by categoria asc"
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

//Select ingredientes disponibles
app.get("/ingredientes", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM ingredientes_extra");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

// Endpoint para obtener relaciones producto-ingrediente
app.get("/producto-ingredientes/:producto_id", async (req, res) => {
  try {
    const { producto_id } = req.params;

    // Verificar que el producto_id sea un número válido
    if (isNaN(producto_id)) {
      return res.status(400).json({ error: "ID de producto inválido" });
    }

    const [relaciones] = await db.query(
      "SELECT ingrediente_id FROM producto_ingredientes WHERE producto_id = ?",
      [producto_id]
    );

    // Extraer solo los IDs de los ingredientes
    const ingredientesIds = relaciones.map((rel) => rel.ingrediente_id);

    res.json(ingredientesIds);
  } catch (error) {
    console.error("Error al obtener relaciones:", error);
    res.status(500).json({
      error: "Error al obtener relaciones",
      details: error.message,
    });
  }
});

// Endpoint para guardar/actualizar relaciones
app.post("/producto-ingredientes", async (req, res) => {
  let connection; // Declaramos la conexión fuera del try para poder cerrarla en el finally

  try {
    const { producto_id, ingredientes } = req.body;

    // Validaciones básicas
    if (!producto_id || isNaN(producto_id)) {
      return res.status(400).json({ error: "ID de producto inválido" });
    }

    if (!Array.isArray(ingredientes)) {
      return res
        .status(400)
        .json({ error: "Formato de ingredientes inválido" });
    }

    // Obtenemos una conexión del pool
    connection = await pool.getConnection();

    // Iniciamos transacción
    await connection.beginTransaction();

    try {
      // 1. Eliminar relaciones existentes
      await connection.query(
        "DELETE FROM producto_ingredientes WHERE producto_id = ?",
        [producto_id]
      );

      // 2. Insertar nuevas relaciones si hay ingredientes
      if (ingredientes.length > 0) {
        // Validar que todos los ingredientes sean números
        const ingredientesValidos = ingredientes.every((id) => !isNaN(id));
        if (!ingredientesValidos) {
          throw new Error("IDs de ingredientes inválidos");
        }

        const values = ingredientes.map((ingrediente_id) => [
          producto_id,
          ingrediente_id,
        ]);
        await connection.query(
          "INSERT INTO producto_ingredientes (producto_id, ingrediente_id) VALUES ?",
          [values]
        );
      }

      // Confirmar transacción
      await connection.commit();
      res.json({ success: true });
    } catch (error) {
      // Revertir transacción en caso de error
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error al guardar relaciones:", error);
    res.status(500).json({
      error: "Error al guardar relaciones",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    // Liberar la conexión de vuelta al pool
    if (connection) connection.release();
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
      ORDER BY c.orden ASC
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Error al obtener los datos de las categorías" });
  }
});

//CrearExtras
app.post("/create-extra", async (req, res) => {
  try {
    const { nombre, descripcion, precio_extra } = req.body;

    // Validaciones básicas
    if (!nombre || !descripcion || !precio_extra === undefined) {
      return res.status(400).json({ error: "Error, completa todo los campos" });
    }

    const [result] = await pool.query(
      `INSERT INTO ingredientes_extra (nombre,descripcion,precio_extra) 
       VALUES (?,?,?)`,
      [nombre, descripcion, precio_extra]
    );

    res.status(201).json({
      id: result.insertId,
      message: "Extra creado correctamente",
      ...req.body,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear extra" });
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

//BACK PARA PEDIDOS

//Crear orden
// Crear pedido con productos, extras, combo y precio_total_extras
app.post("/orders", async (req, res) => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const {
      telefono_usuario,
      direccion_entrega,
      metodo_pago,
      total,
      notas,
      productos,
    } = req.body;

    if (
      !telefono_usuario ||
      !direccion_entrega ||
      !productos ||
      productos.length === 0
    ) {
      return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    // Insertar en pedidos
    const [pedidoResult] = await connection.query(
      `INSERT INTO pedidos (telefono_usuario, direccion_entrega, metodo_pago, total, notas)
       VALUES (?, ?, ?, ?, ?)`,
      [telefono_usuario, direccion_entrega, metodo_pago, total, notas]
    );

    const id_pedido = pedidoResult.insertId;

    // Insertar cada producto con extras, combo y precio_total_extras
    for (const item of productos) {
      const extrasTotal = item.extras
        ? item.extras.reduce(
            (sum, extra) => sum + parseFloat(extra.precio_extra || 0),
            0
          )
        : 0;

      await connection.query(
        `INSERT INTO detalles_pedido 
        (id_pedido, id_producto, cantidad, precio_unitario, extras, combo, precio_total_extras)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id_pedido,
          item.id_producto,
          item.cantidad,
          item.precio_unitario,
          item.extras ? JSON.stringify(item.extras) : null,
          item.combo ? JSON.stringify(item.combo) : null,
          extrasTotal,
        ]
      );
    }

    await connection.commit();
    connection.release();

    res.status(201).json({ id_pedido, message: "Pedido creado exitosamente" });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error(error);
    res.status(500).json({ error: "Error al crear el pedido" });
  }
});

// Obtener pedidos por número telefónico, incluyendo extras y combo
app.get("/orders/user/:telefono", async (req, res) => {
  const { telefono } = req.params;

  try {
    // Obtener todos los pedidos del usuario
    const [pedidos] = await pool.query(
      `SELECT * FROM pedidos WHERE telefono_usuario = ? ORDER BY fecha_pedido DESC`,
      [telefono]
    );

    if (pedidos.length === 0) {
      return res
        .status(404)
        .json({ error: "No se encontraron pedidos para este número" });
    }

    // Para cada pedido, obtener sus productos y parsear los campos extras y combo
    const pedidosConProductos = await Promise.all(
      pedidos.map(async (pedido) => {
        const [productos] = await pool.query(
          `SELECT dp.id_producto, p.nombre, dp.cantidad, dp.precio_unitario, dp.extras, dp.combo, dp.precio_total_extras
           FROM detalles_pedido dp
           JOIN productos p ON p.id_producto = dp.id_producto
           WHERE dp.id_pedido = ?`,
          [pedido.id_pedido]
        );

        const productosCompletos = productos.map((p) => ({
          ...p,
          extras: p.extras ? JSON.parse(p.extras) : [],
          combo: p.combo ? JSON.parse(p.combo) : null,
        }));

        return { ...pedido, productos: productosCompletos };
      })
    );

    res.json(pedidosConProductos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener los pedidos del usuario" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
