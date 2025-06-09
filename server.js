const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors"); // Asegúrate de tener cors como dependencia

const app = express();
const PORT = 3000;

// Ruta donde están los archivos Markdown
const markdownDir = path.join(__dirname, "markdown-files");

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// Middleware para habilitar CORS
app.use(cors({
  origin: "http://localhost:5500" // Solo permite solicitudes desde este origen
}));

// Endpoint para obtener la lista de archivos Markdown
app.get("/api/files", (req, res) => {
  fs.readdir(markdownDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "No se pudo leer la carpeta" });
    }

    // Filtrar solo archivos .md
    const markdownFiles = files.filter((file) => file.endsWith(".md"));
    res.json(markdownFiles);
  });
});

// Endpoint para servir un archivo Markdown específico
app.get("/api/files/:filename", (req, res) => {
  const filePath = path.join(markdownDir, req.params.filename);

  // Verificar si el archivo existe
  if (!fs.existsSync(filePath)) {
    console.error(`Archivo no encontrado: ${filePath}`);
    return res.status(404).json({ error: "Archivo no encontrado" });
  }

  // Enviar el contenido del archivo
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(`Error al enviar el archivo: ${filePath}`, err);
      res.status(500).json({ error: "Error al enviar el archivo" });
    }
  });
});

// Endpoint para servir index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});