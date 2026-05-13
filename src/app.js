import express from "express";
import { pool } from "./db.js";
import { PORT } from "./config.js";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";

const app = express();

/*
  IMPORTANTE:
  Mueve estas credenciales a tu .env cuando puedas.
  Ejemplo:
  CLOUDINARY_CLOUD_NAME=...
  CLOUDINARY_API_KEY=...
  CLOUDINARY_API_SECRET=...
*/
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dxkoujebx",
  api_key: process.env.CLOUDINARY_API_KEY || "191512298222633",
  api_secret:
    process.env.CLOUDINARY_API_SECRET || "KqBGs5GOtaDtx0w2lVYACQ3cGPw",
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

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
    const uploadIndex = pathParts.findIndex((part) => part === "upload");

    if (uploadIndex === -1 || uploadIndex >= pathParts.length - 1) {
      return null;
    }

    const publicIdParts = pathParts.slice(uploadIndex + 2);
    const publicIdWithExtension = publicIdParts.join("/");
    const lastDotIndex = publicIdWithExtension.lastIndexOf(".");

    return lastDotIndex === -1
      ? publicIdWithExtension
      : publicIdWithExtension.substring(0, lastDotIndex);
  } catch (error) {
    console.error("Error parsing Cloudinary URL:", error);
    return null;
  }
}

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      ok: true,
      time: result.rows[0],
    });
  } catch (error) {
    console.error("Error conectando a PostgreSQL:", error);
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/delete-cloudinary-image", async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId || typeof publicId !== "string" || publicId.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "publicId válido es requerido",
        received: publicId,
      });
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
      resource_type: "image",
    });

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

app.put("/categories/update-name/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;

  if (!id || isNaN(Number(id))) {
    return res.status(400).send();
  }

  try {
    const result = await pool.query(
      "UPDATE categorias SET nombre = $1 WHERE id = $2",
      [nombre, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).send();
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error al actualizar:", error);
    res.status(500).send();
  }
});

app.post("/categories/update-order", async (req, res) => {
  const newOrder = req.body;

  if (!Array.isArray(newOrder)) {
    return res
      .status(400)
      .json({ message: "El formato enviado no es correcto" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const cat of newOrder) {
      await client.query("UPDATE categorias SET orden = $1 WHERE id = $2", [
        cat.orden,
        cat.id,
      ]);
    }

    await client.query("COMMIT");
    res.status(200).json({ message: "Orden actualizado correctamente" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al actualizar orden:", error);
    res.status(500).json({ message: "Error actualizando orden" });
  } finally {
    client.release();
  }
});

app.get("/category-asc", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM categorias ORDER BY orden ASC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener categorias" });
  }
});

app.get("/active-orders", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pedidos WHERE estado = $1 OR estado = $2 ORDER BY fecha_pedido DESC",
      ["0", "pendiente"],
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener ordenes" });
  }
});

app.get("/promo", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM productos WHERE disponible = true ORDER BY precio ASC LIMIT 5",
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

app.get("/crepa-combo", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM productos
      WHERE combo IS DISTINCT FROM true
        AND categoria IN ($1, $2)
      ORDER BY categoria ASC
      `,
      ["1", "2"],
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

app.get("/ingredientes", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM ingredientes_extra ORDER BY id_ingrediente ASC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener ingredientes" });
  }
});

app.get("/producto-ingredientes/:producto_id", async (req, res) => {
  try {
    const { producto_id } = req.params;

    if (isNaN(Number(producto_id))) {
      return res.status(400).json({ error: "ID de producto inválido" });
    }

    const result = await pool.query(
      "SELECT ingrediente_id FROM producto_ingredientes WHERE producto_id = $1",
      [producto_id],
    );

    const ingredientesIds = result.rows.map((rel) => rel.ingrediente_id);

    res.json(ingredientesIds);
  } catch (error) {
    console.error("Error al obtener relaciones:", error);
    res.status(500).json({
      error: "Error al obtener relaciones",
      details: error.message,
    });
  }
});

app.get("/order-details/:id_pedido", async (req, res) => {
  try {
    const { id_pedido } = req.params;

    if (isNaN(Number(id_pedido))) {
      return res.status(400).json({ error: "ID de pedido inválido" });
    }

    const result = await pool.query(
      `
      SELECT 
        p.id_pedido,
        p.telefono_usuario,
        p.direccion_entrega,
        p.fecha_pedido,
        p.estado,
        p.metodo_pago,
        p.total,
        p.notas,
        d.id_detalle,
        d.id_producto AS detalle_id_producto,
        d.cantidad,
        d.precio_unitario AS detalle_precio_unitario,
        d.extras,
        d.combo AS detalle_combo,
        d.precio_total_extras,
        d.imagen AS detalle_imagen,
        prod.nombre AS producto_nombre,
        prod.descripcion AS producto_descripcion,
        prod.categoria AS producto_categoria,
        prod.precio AS producto_precio,
        prod.disponible AS producto_disponible,
        prod.imagen_url AS producto_imagen_url,
        prod.combo AS producto_combo
      FROM pedidos p
      JOIN detalles_pedido d ON p.id_pedido = d.id_pedido
      JOIN productos prod ON d.id_producto = prod.id_producto
      WHERE p.id_pedido = $1
      `,
      [id_pedido],
    );

    const rows = result.rows;

    if (rows.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    const pedido = {
      id_pedido: rows[0].id_pedido,
      telefono_usuario: rows[0].telefono_usuario,
      direccion_entrega: rows[0].direccion_entrega,
      fecha_pedido: rows[0].fecha_pedido,
      estado: rows[0].estado,
      metodo_pago: rows[0].metodo_pago,
      total: rows[0].total,
      notas: rows[0].notas,
      detalles: rows.map((row) => ({
        id_detalle: row.id_detalle,
        id_producto: row.detalle_id_producto,
        cantidad: row.cantidad,
        precio_unitario: row.detalle_precio_unitario,
        extras: row.extras,
        combo: row.detalle_combo,
        precio_total_extras: row.precio_total_extras,
        imagen: row.detalle_imagen,
        producto: {
          nombre: row.producto_nombre,
          descripcion: row.producto_descripcion,
          categoria: row.producto_categoria,
          precio: row.producto_precio,
          disponible: row.producto_disponible,
          imagen_url: row.producto_imagen_url,
          combo: row.producto_combo,
        },
      })),
    };

    res.json(pedido);
  } catch (error) {
    console.error("Error al obtener el pedido:", error);
    res.status(500).json({
      error: "Error al obtener el pedido",
      details: error.message,
    });
  }
});

app.post("/producto-ingredientes", async (req, res) => {
  const { producto_id, ingredientes } = req.body;

  if (!producto_id || isNaN(Number(producto_id))) {
    return res.status(400).json({ error: "ID de producto inválido" });
  }

  if (!Array.isArray(ingredientes)) {
    return res.status(400).json({ error: "Formato de ingredientes inválido" });
  }

  const ingredientesValidos = ingredientes.every((id) => !isNaN(Number(id)));
  if (!ingredientesValidos) {
    return res.status(400).json({ error: "IDs de ingredientes inválidos" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "DELETE FROM producto_ingredientes WHERE producto_id = $1",
      [producto_id],
    );

    if (ingredientes.length > 0) {
      const values = [];
      const placeholders = ingredientes
        .map((ingrediente_id, index) => {
          const base = index * 2;
          values.push(producto_id, ingrediente_id);
          return `($${base + 1}, $${base + 2})`;
        })
        .join(", ");

      await client.query(
        `
        INSERT INTO producto_ingredientes (producto_id, ingrediente_id)
        VALUES ${placeholders}
        ON CONFLICT (producto_id, ingrediente_id) DO NOTHING
        `,
        values,
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al guardar relaciones:", error);
    res.status(500).json({
      error: "Error al guardar relaciones",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    client.release();
  }
});

app.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM productos ORDER BY id_producto ASC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

app.get("/allcategories", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM categorias ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener categorias" });
  }
});

app.get("/modal", async (req, res) => {
  try {
    const { id } = req.query;
    const result = await pool.query(
      "SELECT * FROM productos WHERE id_producto = $1",
      [id],
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

app.get("/category", async (req, res) => {
  try {
    const { categoria } = req.query;
    const result = await pool.query(
      "SELECT * FROM productos WHERE categoria = $1 AND disponible = true ORDER BY id_producto ASC",
      [categoria],
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos por categoría" });
  }
});

app.get("/admin", async (req, res) => {
  try {
    const { categoria } = req.query;
    const result = await pool.query(
      "SELECT * FROM productos WHERE categoria = $1 ORDER BY id_producto ASC",
      [categoria],
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener productos por categoría" });
  }
});

app.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      descripcion,
      categoria,
      precio,
      disponible,
      imagen_url,
      combo,
    } = req.body;

    const result = await pool.query(
      `
      UPDATE productos
      SET
        nombre = $1,
        descripcion = $2,
        categoria = $3,
        precio = $4,
        disponible = $5,
        imagen_url = $6,
        combo = COALESCE($7, combo)
      WHERE id_producto = $8
      RETURNING *
      `,
      [
        nombre,
        descripcion,
        categoria,
        precio,
        disponible,
        imagen_url,
        combo,
        id,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json({
      message: "Producto actualizado correctamente",
      producto: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar el producto" });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const productResult = await pool.query(
      "SELECT * FROM productos WHERE id_producto = $1",
      [id],
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    const productData = productResult.rows[0];
    const imageUrl = productData.imagen_url;

    if (imageUrl) {
      const publicId = extractPublicId(imageUrl);

      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
          console.log(`Imagen ${publicId} eliminada de Cloudinary`);
        } catch (cloudinaryError) {
          console.error(
            "Error eliminando imagen de Cloudinary:",
            cloudinaryError,
          );
        }
      }
    }

    const deleteResult = await pool.query(
      "DELETE FROM productos WHERE id_producto = $1",
      [id],
    );

    if (deleteResult.rowCount === 0) {
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

app.post("/products", async (req, res) => {
  try {
    const {
      nombre,
      descripcion,
      categoria,
      precio,
      disponible = true,
      imagen_url,
      combo = false,
    } = req.body;

    if (!nombre || !categoria || precio === undefined) {
      return res
        .status(400)
        .json({ error: "Nombre, categoría y precio son obligatorios" });
    }

    const result = await pool.query(
      `
      INSERT INTO productos
        (nombre, descripcion, categoria, precio, disponible, imagen_url, combo)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id_producto
      `,
      [nombre, descripcion, categoria, precio, disponible, imagen_url, combo],
    );

    res.status(201).json({
      id: result.rows[0].id_producto,
      message: "Producto creado correctamente",
      ...req.body,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear el producto" });
  }
});

app.post("/create-category", async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: "Error, categoria sin nombre" });
    }

    const result = await pool.query(
      "INSERT INTO categorias (nombre) VALUES ($1) RETURNING id",
      [nombre],
    );

    res.status(201).json({
      id: result.rows[0].id,
      message: "Categoria creada correctamente",
      ...req.body,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear categoria" });
  }
});

app.delete("/category/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const productsResult = await pool.query(
      "SELECT id_producto FROM productos WHERE categoria = $1 LIMIT 1",
      [id],
    );

    if (productsResult.rows.length > 0) {
      return res.status(400).json({
        error:
          "No se puede eliminar la categoría porque hay productos asociados.",
      });
    }

    const deleteResult = await pool.query(
      "DELETE FROM categorias WHERE id = $1",
      [id],
    );

    if (deleteResult.rowCount === 0) {
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
    const result = await pool.query(`
      SELECT 
        c.id AS categoria_id,
        c.nombre AS categoria_nombre,
        COUNT(p.id_producto) AS total_productos
      FROM categorias c
      LEFT JOIN productos p ON p.categoria::integer = c.id
      GROUP BY c.id, c.nombre, c.orden
      ORDER BY c.orden ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Error al obtener los datos de las categorías" });
  }
});

app.post("/create-extra", async (req, res) => {
  try {
    const { nombre, descripcion, precio_extra, disponible = true } = req.body;

    if (!nombre || !descripcion || precio_extra === undefined) {
      return res
        .status(400)
        .json({ error: "Error, completa todos los campos" });
    }

    const result = await pool.query(
      `
      INSERT INTO ingredientes_extra
        (nombre, descripcion, precio_extra, disponible)
      VALUES
        ($1, $2, $3, $4)
      RETURNING id_ingrediente
      `,
      [nombre, descripcion, precio_extra, disponible],
    );

    res.status(201).json({
      id: result.rows[0].id_ingrediente,
      message: "Extra creado correctamente",
      ...req.body,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear extra" });
  }
});

app.post("/orders", async (req, res) => {
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
    !Array.isArray(productos) ||
    productos.length === 0
  ) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pedidoResult = await client.query(
      `
      INSERT INTO pedidos
        (telefono_usuario, direccion_entrega, metodo_pago, total, notas)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING id_pedido
      `,
      [telefono_usuario, direccion_entrega, metodo_pago, total, notas],
    );

    const id_pedido = pedidoResult.rows[0].id_pedido;

    for (const item of productos) {
      const precioTotalExtrasCalculado = Array.isArray(item.extras_full)
        ? item.extras_full.reduce(
            (sum, extra) => sum + parseFloat(extra.precio_extra || 0),
            0,
          )
        : 0;

      await client.query(
        `
        INSERT INTO detalles_pedido
          (
            id_pedido,
            id_producto,
            cantidad,
            precio_unitario,
            extras,
            combo,
            precio_total_extras,
            imagen
          )
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          id_pedido,
          item.id_producto,
          item.cantidad,
          item.precio_unitario,
          item.extras || null,
          item.combo || null,
          item.precio_total_extras ?? precioTotalExtrasCalculado,
          item.imagen,
        ],
      );
    }

    await client.query("COMMIT");

    res.status(201).json({ id_pedido, message: "Pedido creado exitosamente" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Error al crear el pedido" });
  } finally {
    client.release();
  }
});

app.get("/orders/user/:telefono", async (req, res) => {
  const { telefono } = req.params;

  try {
    const pedidosResult = await pool.query(
      `
      SELECT *
      FROM pedidos
      WHERE telefono_usuario = $1
      ORDER BY fecha_pedido DESC
      `,
      [telefono],
    );

    const pedidos = pedidosResult.rows;

    if (pedidos.length === 0) {
      return res
        .status(404)
        .json({ error: "No se encontraron pedidos para este número" });
    }

    const pedidosConProductos = await Promise.all(
      pedidos.map(async (pedido) => {
        const productosResult = await pool.query(
          `
          SELECT
            dp.id_producto,
            p.nombre,
            dp.cantidad,
            dp.precio_unitario,
            dp.extras,
            dp.combo,
            dp.precio_total_extras,
            dp.imagen
          FROM detalles_pedido dp
          JOIN productos p ON p.id_producto = dp.id_producto
          WHERE dp.id_pedido = $1
          `,
          [pedido.id_pedido],
        );

        const productosProcesados = productosResult.rows.map((p) => ({
          ...p,
          extras: p.extras || "",
          combo: p.combo || "",
          precio_total_extras: parseFloat(p.precio_total_extras || 0),
        }));

        return { ...pedido, productos: productosProcesados };
      }),
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
