const MarkdownManager = {
    saveMarkdownFile: (updatedContent, filename) => {
        const blob = new Blob([updatedContent], { type: 'text/markdown' });

        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = filename;
        downloadLink.click();
    },

    modifyChecklist: () => {
        const lines = document.getElementById("markdown-editor").value.split("\n");
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        let checkboxIndex = 0;

        try {
            for (let i = 0; i < lines.length; i++) {
                if (checkboxIndex >= checkboxes.length) {
                    break;
                }

                // Detectar tareas y subtareas con cualquier nivel de indentación
                if (lines[i].match(/^\s*- \[.\]/)) {
                    const isChecked = checkboxes[checkboxIndex].checked ? "x" : " ";
                    lines[i] = lines[i].replace(/- \[.\]/, `- [${isChecked}]`);
                    checkboxIndex++;
                }
            }
        } catch (err) {
            console.error("Error updating checklist content:", err);
        }

        // Retornar el contenido actualizado
        return lines.join("\n");
    }
};

const ProgressManager = {
    calculateProgress: () => {
        const checklistItems = document.querySelectorAll('input[type="checkbox"]');
        const totalItems = checklistItems.length;
        const completedItems = Array.from(checklistItems).filter(item => item.checked).length;
        const percentage = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);
        return { percentage, completedItems, totalItems };
    },

    calculateTotalEstimate: (processedMarkdown) => {
        if (!processedMarkdown || typeof processedMarkdown !== "string") {
            //console.error("El contenido del Markdown procesado es inválido:", processedMarkdown);
            return 0; // Retornar 0 si el contenido es inválido
        }

        let totalEstimate = 0;

        // Dividir el contenido en secciones por título de nivel 1
        const sections = processedMarkdown.split(/^# /gm); // Dividir por títulos de nivel 1 (que comienzan con "# ")

        sections.forEach(section => {
            // Verificar si la sección es un título de nivel 1 que contiene "Tarea"
            if (section.trim().startsWith("Tarea")) {
                // Buscar etiquetas estimate:: xh en líneas separadas dentro de la sección
                const estimates = section.match(/\(estimate::\s*(\d+(\.\d+)?)h\)/g);
                if (estimates) {
                    estimates.forEach(estimate => {
                        const hours = parseFloat(estimate.match(/(\d+(\.\d+)?)h/)[1]);
                        totalEstimate += hours;
                    });
                }
            }
        });

        return totalEstimate;
    },

    updateProgress: (totalEstimate = null) => {
        const { percentage, completedItems, totalItems } = ProgressManager.calculateProgress();
        const progressBar = document.querySelector("#progress-bar");
        const progressNumber = document.querySelector("#progress-number");

        // Si no se pasa un estimado total, calcularlo
        if (totalEstimate === null) {
            totalEstimate = ProgressManager.calculateTotalEstimate();
        }

        progressBar.style.width = `${percentage}%`;
        progressNumber.textContent = `${percentage}% completado (${completedItems} de ${totalItems} pasos) - Estimado total: ${totalEstimate}h`;
    }
};

let availableFiles = [];

// Función para cargar la lista de archivos desde el servidor
async function fetchAvailableFiles() {
    try {
        const response = await fetch("http://localhost:3000/api/files");
        if (!response.ok) {
            throw new Error(`Error ${response.status}: No se pudo obtener la lista de archivos`);
        }
        availableFiles = await response.json();
    } catch (error) {
        console.error("Error al cargar los archivos disponibles:", error);
        alert("Hubo un problema al cargar la lista de archivos. Intenta nuevamente más tarde.");
    }
}

// Llamar a la función al cargar la página
document.addEventListener("DOMContentLoaded", async () => {
    await fetchAvailableFiles();
    document.getElementById("markdown-editor").value = ""; // Editor vacío por defecto
});

async function loadMarkdownFile(filePath) {
    try {
        const response = await fetch(`http://localhost:3000/api/files/${filePath}`);
        if (!response.ok) {
            throw new Error(`No se pudo cargar el archivo: ${filePath}`);
        }
        return await response.text();
    } catch (error) {
        console.error(error);
        return `**Error:** No se pudo cargar el archivo: ${filePath}`;
    }
}

async function processTransclusions(markdown) {
    const transclusionRegex = /!\[\[(.*?)\]\]/g; // Detecta ![[archivo]] o ![[archivo#sección]]
    let match;

    while ((match = transclusionRegex.exec(markdown)) !== null) {
        const reference = match[1].trim(); // Obtiene el contenido dentro de ![[ ]]
        let [filePath, section] = reference.split("#"); // Divide en archivo y sección (si existe)

        // Agregar la extensión .md si no está presente
        if (!filePath.endsWith(".md")) {
            filePath += ".md";
        }

        try {
            const fileContent = await loadMarkdownFile(filePath); // Carga el contenido del archivo

            let contentToInsert = fileContent;

            // Si se especifica una sección, extraer solo esa parte
            if (section) {
                const sectionRegex = new RegExp(`(^|\\n)(#+\\s*${section}\\s*\\n)([\\s\\S]*?)(\\n#+|$)`, "i");
                const sectionMatch = fileContent.match(sectionRegex);
                contentToInsert = sectionMatch
                    ? `${sectionMatch[2].trim()}\n${sectionMatch[3].trim()}` // Incluye el título y el contenido
                    : `**Error:** No se encontró la sección "${section}".`;
            }

            // Reemplaza la referencia con el contenido correspondiente
            markdown = markdown.replace(match[0], contentToInsert);
        } catch (error) {
            console.error(`Error al procesar la transclusión para ${reference}:`, error);
            markdown = markdown.replace(match[0], `**Error:** No se pudo cargar "${reference}".`);
        }
    }

    return markdown;
}

async function renderChecklist(markdown) {
    const checklistElement = document.querySelector("#checklist");


    const md = window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
       
   });

    md.use(window.markdownitCheckbox);


    // Procesa las transclusiones antes de renderizar
    const processedMarkdown = await processTransclusions(markdown);

    // Verifica que processedMarkdown no sea undefined o null
    if (!processedMarkdown) {
        console.error("El Markdown procesado es inválido.");
        return;
    }

    // Eliminar bloques delimitados por tres guiones seguidos (---)
    const cleanedMarkdown = processedMarkdown.replace(/^---[\s\S]*?^---$/gm, '');

    // Numerar automáticamente las tareas (sin jerarquía)
    const lines = cleanedMarkdown.split("\n");
    let taskCounter = 1;

    const numberedMarkdown = lines.map(line => {
        if (line.match(/^\s*- \[\s*\]/)) { // Detectar tareas sin marcar con cualquier cantidad de espacios o tabuladores
            return line.replace(/^\s*- \[\s*\]/, `${line.match(/^\s*/)[0]}- [ ] ${taskCounter++}.`);
        } else if (line.match(/^\s*- \[x\]/i)) { // Detectar tareas marcadas con cualquier cantidad de espacios o tabuladores
            return line.replace(/^\s*- \[x\]/i, `${line.match(/^\s*/)[0]}- [x] ${taskCounter++}.`);
        }
        return line; // Dejar líneas no relacionadas sin cambios
    }).join("\n");

    checklistElement.innerHTML = md.render(numberedMarkdown);

    // Actualizar el progreso después de renderizar y calcular el estimado total
    const totalEstimate = ProgressManager.calculateTotalEstimate(processedMarkdown);
    ProgressManager.updateProgress(totalEstimate);
}

// Mostrar/ocultar el editor de Markdown
document.getElementById("toggle-editor-button").addEventListener("click", () => {
    const editorContainer = document.getElementById("markdown-editor-container");
    const toggleButton = document.getElementById("toggle-editor-button");

    if (editorContainer.style.display === "none") {
        editorContainer.style.display = "block";
        toggleButton.textContent = "🔒 Cerrar editor";
    } else {
        editorContainer.style.display = "none";
        toggleButton.textContent = "✏️ Editar checklist";
    }
});

document.getElementById("preview-markdown-button").addEventListener("click", () => {
    const markdownContent = document.getElementById("markdown-editor").value;
    renderChecklist(markdownContent);
});

document.getElementById("search-button").addEventListener("click", () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md';

    input.onchange = (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            const markdownContent = e.target.result;
            localStorage.setItem("checklist", markdownContent);
            document.getElementById("markdown-editor").value = markdownContent;
            renderChecklist(markdownContent);
        };

        reader.readAsText(file);
    };

    input.click();
});

document.getElementById("download-button").addEventListener("click", () => {
    const updatedContent = document.getElementById("markdown-editor").value;
    const filenameInput = document.getElementById("filename-input").value.trim();

    // Usa el nombre ingresado por el usuario o un nombre por defecto
    const filename = filenameInput || "checklist.md";

    MarkdownManager.saveMarkdownFile(updatedContent, filename);
});

// Validar el nombre del archivo antes de descargar
function validateFilename(filename) {
    const invalidChars = /[<>:"/\\|?*]/g;
    if (invalidChars.test(filename)) {
        alert("El nombre del archivo contiene caracteres no válidos: <>:\"/\\|?*");
        return false;
    }
    return true;
}

// Forzar extensión .html y descargar el archivo
function createAndDownloadHtmlFile(content, filename) {
    // Forzar extensión .html
    filename = filename.replace(/\.[^/.]+$/, ""); // Quita extensión si existe
    filename = filename + ".html";

    const blob = new Blob([content], { type: "text/html" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;

    // Para navegadores modernos, limpiar el objeto URL después de descargar
    link.addEventListener('click', function() {
        setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    });

    document.body.appendChild(link); // Necesario para Firefox
    link.click();
    document.body.removeChild(link);
}

document.getElementById("download-rendered-button").addEventListener("click", () => {
    // Clonar el contenido del checklist para manipularlo sin afectar el DOM original
    const checklistClone = document.querySelector("#checklist").cloneNode(true);

    // Actualizar los atributos `checked` de los checkboxes en el clon
    checklistClone.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        if (checkbox.checked) {
            checkbox.setAttribute("checked", "checked");
        } else {
            checkbox.removeAttribute("checked");
        }
    });

    // Obtener el contenido HTML actualizado del checklist
    const checklistContent = checklistClone.innerHTML;

    // Crear el contenido HTML completo
    const fullHtmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Checklist Export</title>
        <style>
          #progress-container {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 270px;
            z-index: 1000;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 5px;
            padding: 10px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
          }
          #progress-bar-container {
            width: 100%;
            background: #eee;
            height: 20px;
            border-radius: 5px;
            overflow: hidden;
          }
          #progress-bar {
            height: 20px;
            width: 0%;
            background: #4caf50;
            transition: width 0.3s;
          }
          #progress-number {
            margin-top: 5px;
            font-weight: bold;
            text-align: center;
          }
          #progress-details {
            margin-top: 8px;
            font-size: 15px;
            text-align: center;
          }
          input[type="checkbox"] {
            margin-right: 10px;
          }
        </style>
      </head>
      <body>
        <div id="progress-container">
          <div style="display: grid; place-items: center;"><button id="toggle-all-btn" type="button" >☐ Deseleccionar todos</button></div>
          <div id="progress-bar-container">
            <div id="progress-bar"></div>
          </div>
          <div id="progress-number"></div>
          <div id="progress-details"></div>
        </div>
        <div id="checklist">
          ${checklistContent}
        </div>
          <script>
          function updateProgress() {
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');document.querySelectorAll('input[type="checkbox"]')
            const total = checkboxes.length;
            const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
            const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

            document.getElementById("progress-bar").style.width = percent + "%";
            document.getElementById("progress-number").textContent = "Progreso: " + percent + "%";
                        document.getElementById("progress-details").textContent = \`Pasos: \${checked} de \${total} completados\`;
            showRemainingTime();
          }
          
          // 📊 Mostrar tiempo restante Vs total con margen del 30%
          function showRemainingTime() {
            const remainingMinutes = getRemainingMinutes().toFixed(0);
            const remainingHours = (remainingMinutes / 60).toFixed(2);

            // Crear o actualizar la línea extra
            let existingLine = document.getElementById("remaining-time");
            if (!existingLine) {
              existingLine = document.createElement("div");
              existingLine.id = "remaining-time";
              existingLine.style.fontSize = "14px";
              existingLine.style.marginTop = "8px";
              existingLine.style.textAlign = "center";
              document.getElementById("progress-container").appendChild(existingLine);
            }
            const tiempoTotal=getTotalTiempo();
            existingLine.textContent = \`⏳ Tiempo restante: \${remainingHours}h de \${tiempoTotal.totalHours}h ó \${remainingMinutes}min de \${tiempoTotal.totalMinutes}min\`;
          }

          
          function getRemainingMinutes(){
            let totalMinutes=0;
            let remainingMinutes = 0;
            const labels = document.querySelectorAll("label");  
            labels.forEach(label => {
              const match = label.textContent.match(/estimate::\\s*([\\d.]+)m/);
              if (match) {
                const minutes = parseFloat(match[1]);
                const withMargin = minutes * 1.3;

                totalMinutes += withMargin;

                const checkbox = document.getElementById(label.getAttribute("for"));
                if (checkbox && !checkbox.checked) {
                  remainingMinutes += withMargin;
                }
              }
            });
            return Math.round(remainingMinutes * 1.3);
          }
          
          function getTotalTiempo(){
            const tareasEstimadas = obtenerTiemposPorTarea();
            let totalHours=0;
            let totalMinutes=0;
            tareasEstimadas.forEach(tarea => {
              totalHours+=tarea.estimateHoras;
              totalMinutes+=tarea.estimateMinutos;
            });
            
            return {
				     totalHours: totalHours.toFixed(2),
				     totalMinutes: Math.round(totalMinutes)
				   };            
          }

          function downloadUpdatedHtml() {
            document.querySelectorAll('#checklist input[type="checkbox"]').forEach(checkbox => {
              if (checkbox.checked) {
                checkbox.setAttribute('checked', 'checked');
              } else {
                checkbox.removeAttribute('checked');
              }
            });
            const doc = document.documentElement.cloneNode(true);
            doc.querySelectorAll('#save-changes-btn, #download-updated-btn').forEach(btn => btn.remove());
            const htmlContent = '<!DOCTYPE html>' + doc.outerHTML;
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'checklist_exportado.html';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              URL.revokeObjectURL(a.href);
              document.body.removeChild(a);
            }, 100);
          }

          function addDownloadUpdatedButton() {
            let downloadBtn = document.getElementById('download-updated-btn');
            if (!downloadBtn) {
              downloadBtn = document.createElement('button');
              downloadBtn.id = 'download-updated-btn';
              downloadBtn.textContent = '⬇️ Descargar archivo actualizado';
              downloadBtn.style.margin = '0 0 20px 0';
              downloadBtn.style.display = 'block';
              downloadBtn.onclick = downloadUpdatedHtml;
              document.body.insertBefore(downloadBtn, document.getElementById('checklist'));
            }
          }
          
          function calcularTiempoPorTareaYActualizarHTML() {
            const checklist = document.getElementById('checklist');
            const tareas = [];

            let tareaActual = null;
            let estimateParaReemplazar = null;

            // Recorremos todos los nodos del checklist
            checklist.childNodes.forEach(node => {
              if (node.nodeType === 1) { // solo elementos
                if (node.tagName === 'H1' && node.textContent.trim().startsWith('Tarea:')) {
                  // Inicia una nueva tarea
                  tareaActual = {
                    nombre: node.textContent.replace('Tarea:', '').trim(),
                    tiempoMinutos: 0,
                    estimateNode: null
                  };
                  tareas.push(tareaActual);
                  estimateParaReemplazar = null;
                }

                // Detectamos el <p>(estimate:: [reemplazar])</p> que está justo después del H1
                if (tareaActual && node.tagName === 'P' && /\\(estimate::\\s*\\[reemplazar\\]\\)/i.test(node.textContent)) {
                  tareaActual.estimateNode = node; // guardamos el nodo para reemplazar luego
                }

                // Si hay inputs dentro del UL, buscamos los estimate por checkbox
                if (tareaActual && (node.tagName === 'UL' || node.tagName === 'OL')) {
                  const checkboxes = node.querySelectorAll('input[type="checkbox"]');
                  checkboxes.forEach(checkbox => {
                    const label = document.querySelector(\`label[for="\${checkbox.id}"]\`);
                    let textoEstimate = label ? label.textContent : '';

                    // Si no hay estimate en label, buscamos en el <li>
                    if (!textoEstimate.includes('estimate::')) {
                      const li = checkbox.closest('li');
                      if (li) {
                        textoEstimate = li.textContent;
                      }
                    }

                    const match = textoEstimate.match(/\\(estimate::\\s*([\\d.,]+)([mh])\\)/i);
                    if (match) {
                      const valor = parseFloat(match[1].replace(',', '.'));
                      const unidad = match[2].toLowerCase();
                      let minutos = unidad === 'h' ? valor * 60 : valor;
                      tareaActual.tiempoMinutos += minutos;
                    }
                  });
                }
              }
            });
      

            // Una vez terminado el recorrido, actualizamos los estimate en el HTML
            tareas.forEach(tarea => {
              if (tarea.estimateNode) {
                let horas = (Math.round(tarea.tiempoMinutos * 1.3) /60).toFixed(2);
                let minutos = (Math.round(tarea.tiempoMinutos * 1.3)).toFixed(0) 
                if(horas < 0.25){
                   horas = 0.25;
                   minutos = 15;
                }
                tarea.estimateNode.textContent = \`(estimate:: \${horas}h / \${minutos}min)\`;
              }
            });

          }

          // Ejecutar la función cuando el documento esté cargado
          document.addEventListener("DOMContentLoaded", () => {
            calcularTiempoPorTareaYActualizarHTML();
          });
          
          function obtenerTiemposPorTarea() {
            const checklist = document.getElementById('checklist');
            const tareas = [];

            let tareaActual = null;

            Array.from(checklist.children).forEach(node => {
              if (node.tagName === 'H1' && node.textContent.trim().startsWith('Tarea:')) {
                tareaActual = {
                  nombre: node.textContent.replace('Tarea:', '').trim(),
                  tiempoMinutos: 0,
                  estimateRaw: null, // <== aquí guardamos el nodo si lo necesitas
                  estimateHoras: 0,
                  estimateMinutos: 0
                };
                tareas.push(tareaActual);

                let siguiente = node.nextElementSibling;
                while (siguiente && siguiente.tagName !== 'P') {
                  siguiente = siguiente.nextElementSibling;
                }
                if (siguiente && /\\(estimate::\\s*\\[reemplazar\\]\\)/i.test(siguiente.textContent)) {
                  tareaActual.estimateRaw = siguiente;
                }
              }

              if (tareaActual && (node.tagName === 'UL' || node.tagName === 'OL')) {
                const checkboxes = node.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                  const label = document.querySelector(\`label[for="\${checkbox.id}"]\`);
                  let textoEstimate = label ? label.textContent : '';

                  if (!textoEstimate.includes('estimate::')) {
                    const li = checkbox.closest('li');
                    if (li) {
                      textoEstimate = li.textContent;
                    }
                  }

                  const match = textoEstimate.match(/\\(estimate::\\s*([\\d.,]+)([mh])\\)/i);
                  if (match) {
                    const valor = parseFloat(match[1].replace(',', '.'));
                    const unidad = match[2].toLowerCase();
                    let minutos = unidad === 'h' ? valor * 60 : valor;
                    tareaActual.tiempoMinutos += minutos;
                  }
                });
              }
            });

            // Ajuste de tiempos con margen +30% y mínimo 0.25h
            tareas.forEach(tarea => {
              let minutosConMargen = Math.round(tarea.tiempoMinutos * 1.3);
              let horasConMargen = (minutosConMargen / 60);

              if (horasConMargen < 0.25) {
                horasConMargen = 0.25;
                minutosConMargen = 15;
              }

              tarea.estimateHoras = parseFloat(horasConMargen.toFixed(2));
              tarea.estimateMinutos = minutosConMargen;
            });

            return tareas;
          }

          document.querySelectorAll('#checklist input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
              updateProgress();
            });
          });
          
          function updateToggleAllBtn() {
              const checkboxes = document.querySelectorAll('#checklist input[type="checkbox"]');
              const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked); // Verificar si todos están marcados
              const btn = document.getElementById('toggle-all-btn');
              if (!btn) return;
              if (allChecked) {
                btn.textContent = "☐ Deseleccionar todos";
              } else {
                btn.textContent = "☑️ Seleccionar todos";
              }
          }
            
          function toggleAllCheckboxes() {
            const checkboxes = document.querySelectorAll('#checklist input[type="checkbox"]');
            const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked); // Verificar si todos están marcados

            // Alternar entre marcar y desmarcar
            checkboxes.forEach(checkbox => {
              checkbox.checked = !allChecked;
            });

            // Actualizar el progreso
            updateProgress();

            // Cambiar el texto del botón
            updateToggleAllBtn();
          }
          
          document.getElementById('toggle-all-btn').addEventListener('click', toggleAllCheckboxes);

          
          // Inicialización
          updateProgress();
          addDownloadUpdatedButton();
          updateToggleAllBtn();
          </script>

      </body>
      </html>
    `;

    // Validar el nombre del archivo
    let filename = document.getElementById("filename-input")?.value.trim();
    if (!filename) filename = "checklist_exportado";
    if (!validateFilename(filename)) return;

    // Crear y descargar el archivo HTML
    createAndDownloadHtmlFile(fullHtmlContent, filename);
});

// Mostrar/Ocultar el popup de ayuda
document.getElementById("help-icon").addEventListener("click", () => {
    const helpPopup = document.getElementById("help-popup");
    helpPopup.style.display = "block";
});

document.getElementById("close-help-button").addEventListener("click", () => {
    const helpPopup = document.getElementById("help-popup");
    helpPopup.style.display = "none";
});

function showSuggestionModal(suggestions, onSelect) {
    const modal = document.getElementById("suggestion-modal");
    const suggestionList = document.getElementById("suggestion-list");

    // Limpiar sugerencias anteriores
    suggestionList.innerHTML = "";

    // Agregar nuevas sugerencias
    suggestions.forEach((suggestion) => {
        const listItem = document.createElement("li");
        listItem.textContent = suggestion;
        listItem.style.cursor = "pointer";
        listItem.style.padding = "5px 0";
        listItem.addEventListener("click", () => {
            // Eliminar la extensión .md antes de pasar al callback
            const suggestionWithoutExtension = suggestion.replace(/\.md$/, "");
            onSelect(suggestionWithoutExtension);
            modal.style.display = "none";
        });
        suggestionList.appendChild(listItem);
    });

    // Mostrar el modal
    modal.style.display = "block";
}

// Función para mostrar el cuadro contextual de sugerencias
function showSuggestionBox(suggestions, cursorPosition, editor) {
    const suggestionBox = document.getElementById("suggestion-box");

    // Limpiar sugerencias anteriores
    suggestionBox.innerHTML = "";

    // Agregar nuevas sugerencias sin la extensión .md
    suggestions.forEach((suggestion, index) => {
        const suggestionWithoutExtension = suggestion.replace(/\.md$/, ""); // Eliminar extensión .md
        const suggestionItem = document.createElement("div");
        suggestionItem.textContent = suggestionWithoutExtension;
        suggestionItem.style.padding = "5px";
        suggestionItem.style.cursor = "pointer";
        suggestionItem.dataset.index = index;

        // Resaltar al pasar el mouse
        suggestionItem.addEventListener("mouseover", () => {
            suggestionBox.querySelectorAll("div").forEach(item => item.style.background = "white");
            suggestionItem.style.background = "#f0f0f0";
        });

        // Seleccionar sugerencia al hacer clic
        suggestionItem.addEventListener("click", () => {
            insertSuggestion(editor, suggestionWithoutExtension);
            hideSuggestionBox();
        });

        suggestionBox.appendChild(suggestionItem);
    });

    // Posicionar el cuadro contextual cerca del cursor
    const editorRect = editor.getBoundingClientRect();
    const lineHeight = 20; // Altura aproximada de una línea en el editor
    suggestionBox.style.left = `${editorRect.left + window.scrollX}px`;
    suggestionBox.style.top = `${editorRect.top + cursorPosition.top + lineHeight + window.scrollY}px`;
    suggestionBox.style.width = `${editorRect.width}px`;
    suggestionBox.style.display = "block";
}

// Función para ocultar el cuadro contextual
function hideSuggestionBox() {
    const suggestionBox = document.getElementById("suggestion-box");
    suggestionBox.style.display = "none";
}

// Función para insertar la sugerencia seleccionada
function insertSuggestion(editor, suggestion) {
    const cursorPosition = editor.selectionStart;
    const textBeforeCursor = editor.value.substring(0, cursorPosition);
    const textAfterCursor = editor.value.substring(cursorPosition);

    // Buscar el inicio de [[
    const startIndex = textBeforeCursor.lastIndexOf("[[");

    if (startIndex !== -1) {
        // Verificar si ya existe el delimitador ]]
        const endIndex = textAfterCursor.indexOf("]]");

        if (endIndex !== -1) {
            // Caso 1: Reemplazar el contenido existente dentro de [[ ]]
            const newTextBeforeCursor = textBeforeCursor.substring(0, startIndex + 2); // Mantener [[
            const newTextAfterCursor = textAfterCursor.substring(endIndex + 2); // Mantener lo que está después de ]]
            editor.value = `${newTextBeforeCursor}${suggestion}${newTextAfterCursor}`;
        } else {
            // Caso 2: Agregar la sugerencia y cerrar con ]]
            const newTextBeforeCursor = textBeforeCursor.substring(0, startIndex + 2); // Mantener [[
            editor.value = `${newTextBeforeCursor}${suggestion}]]${textAfterCursor}`;
        }

        // Posicionar el cursor después de la sugerencia
        editor.focus();
        editor.selectionStart = editor.selectionEnd = startIndex + 2 + suggestion.length + 2; // [[ + sugerencia + ]]
    } else {
        console.error("No se encontró el delimitador [[ para insertar la sugerencia.");
    }
}

// Detectar escritura en el editor Markdown
document.getElementById("markdown-editor").addEventListener("input", async (event) => {
    const editor = event.target;
    const cursorPosition = editor.selectionStart;
    const textBeforeCursor = editor.value.substring(0, cursorPosition);

    // Detectar texto entre [[ y ]]
    const match = textBeforeCursor.match(/\!\[\[([^\]]*)$/);
    if (match) {
        const partialText = match[1]; // Texto parcial dentro de [[ ]]
        const filteredSuggestions = availableFiles.filter(file =>
            file.toLowerCase().includes(partialText.toLowerCase())
        );
        const cursorCoords = editor.getBoundingClientRect();
        const lineHeight = 20; // Altura aproximada de una línea en el editor
        showSuggestionBox(filteredSuggestions, {
            top: cursorCoords.top + lineHeight,
        }, editor);
    } else {
        hideSuggestionBox();
    }
});

// Manejar selección con teclado (flechas arriba/abajo y enter)
document.getElementById("markdown-editor").addEventListener("keydown", (event) => {
    const suggestionBox = document.getElementById("suggestion-box");
    if (suggestionBox.style.display === "none") return;

    const items = suggestionBox.querySelectorAll("div");
    let selectedIndex = Array.from(items).findIndex(item => item.style.background === "rgb(240, 240, 240)");

    if (event.key === "ArrowDown") {
        event.preventDefault();
        if (selectedIndex < items.length - 1) {
            if (selectedIndex >= 0) items[selectedIndex].style.background = "white";
            items[++selectedIndex].style.background = "#f0f0f0";
        }
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (selectedIndex > 0) {
            items[selectedIndex].style.background = "white";
            items[--selectedIndex].style.background = "#f0f0f0";
        }
    } else if (event.key === "Enter") {
        event.preventDefault();
        if (selectedIndex >= 0) {
            const selectedSuggestion = items[selectedIndex].textContent;
            insertSuggestion(event.target, selectedSuggestion);
            hideSuggestionBox();
        }
    }
});

// Delegación de eventos para los checkboxes
document.querySelector("#checklist").addEventListener("change", (event) => {
    if (event.target.type === "checkbox") {
        const updatedMarkdown = MarkdownManager.modifyChecklist();
        document.getElementById("markdown-editor").value = updatedMarkdown; // Sincronizar con el editor
        ProgressManager.updateProgress();
    }
});


// Función para alternar entre marcar y desmarcar todos los checkboxes
function toggleAllCheckboxes() {
    const checkboxes = document.querySelectorAll('#checklist input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked); // Verificar si todos están marcados

    // Alternar entre marcar y desmarcar
    checkboxes.forEach(checkbox => {
        checkbox.checked = !allChecked;
    });

    // Actualizar el progreso
    ProgressManager.updateProgress();

    // Cambiar el texto del botón
    const button = document.getElementById("select-all-button");
    button.textContent = allChecked ? "✔️ Marcar todo" : "❌ Desmarcar todo";
}

// Agregar evento al botón "Marcar/Desmarcar todo"
document.getElementById("select-all-button").addEventListener("click", toggleAllCheckboxes);