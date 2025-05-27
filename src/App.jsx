import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./Login";

// Días de la semana (para iterar y mostrar en la tabla)
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function generarSemanaVacia(recetas) {
  // Genera una semana vacía, con selectores para cada receta
  return DIAS.map(() => ({
    fecha: "",
    adultos: 0,
    ninos: 0,
    principal: "",
    acompañamiento: "",
    postre: "",
    ingredientesUsados: {}, // { ingrediente: cantidad }
  }));
}

// Calcula la suma mensual de todos los ingredientes
function calcularSumaMensual(semanas, recetasDisponibles) {
  const suma = {};
  semanas.forEach(semana => {
    semana.forEach(dia => {
      // Obtiene ingredientes de cada receta seleccionada
      ["principal", "acompañamiento", "postre"].forEach(tipo => {
        const receta = recetasDisponibles.find(r => r.nombre === dia[tipo]);
        if (receta) {
          receta.ingredientes.forEach(ing => {
            const clave = `${ing.nombre}`.toLowerCase();
            const totalComensales = Number(dia.adultos) + Number(dia.ninos);
            const total = Number(ing.cantidad) * totalComensales;
            suma[clave] = (suma[clave] || 0) + total;
          });
        }
      });
      // Si el usuario completó manualmente ingredientesUsados, lo suma también
      Object.entries(dia.ingredientesUsados).forEach(([ing, cant]) => {
        suma[ing.toLowerCase()] = (suma[ing.toLowerCase()] || 0) + Number(cant);
      });
    });
  });
  return suma;
}

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [recetas, setRecetas] = useState([]);
  const [tab, setTab] = useState("pedidos");

  // Estado de Pedidos (como antes)
  const [comensales, setComensales] = useState(0);
  const [resultado, setResultado] = useState([]);
  const [filtroDia, setFiltroDia] = useState("semana");
  const [menu, setMenu] = useState({
    lunes: { principal: "", acompañamiento: "", postre: "" },
    martes: { principal: "", acompañamiento: "", postre: "" },
    miercoles: { principal: "", acompañamiento: "", postre: "" },
    jueves: { principal: "", acompañamiento: "", postre: "" },
    viernes: { principal: "", acompañamiento: "", postre: "" },
  });
  const [nuevaReceta, setNuevaReceta] = useState({
    nombre: "",
    tipo: "principal",
    ingredientes: [{ nombre: "", unidad: "g", cantidad: 0 }],
  });
  const [recetaEditando, setRecetaEditando] = useState(null);

  // Estado de Registro mensual
  const [semanas, setSemanas] = useState(() =>
    Array.from({ length: 5 }, () => generarSemanaVacia([]))
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
    });
    return () => unsubscribe();
  }, []);

  // Carga recetas precargadas y de usuario
  useEffect(() => {
    const recetasUsuario = JSON.parse(localStorage.getItem("recetas")) || [];
    fetch("/data/recetas_precargadas.json")
      .then(res => res.json())
      .then(data => {
        // Normaliza tipo, quita tildes, y arregla nombres
        const recetasNormalizadas = data.map(r => {
          const tipoNormalizado = r.tipo
            ? r.tipo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
            : "";
          const tipoFinal = tipoNormalizado === "acompanamiento" ? "acompañamiento" : tipoNormalizado;
          const ingredientes = (r.ingredientes || []).map(ing => ({
            nombre: ing.nombre || ing.ingrediente || "",
            unidad: ing.unidad,
            cantidad: ing.cantidad,
          }));
          return { ...r, tipo: tipoFinal, ingredientes };
        });
        setRecetas([...recetasNormalizadas, ...recetasUsuario]);
        // Prepara semanas con recetas disponibles
        setSemanas(Array.from({ length: 5 }, () => generarSemanaVacia([...recetasNormalizadas, ...recetasUsuario])));
      });
  }, []);

  useEffect(() => {
    localStorage.setItem("recetas", JSON.stringify(recetas));
  }, [recetas]);

  // ========== PEDIDOS LOGIC ==========
  const calcularPedido = () => {
    const ingredientesTotales = {};
    const dias = filtroDia === "semana" ? Object.values(menu) : [menu[filtroDia]];

    dias.forEach(({ principal, acompañamiento, postre }) => {
      [principal, acompañamiento, postre].forEach((rec) => {
        const receta = recetas.find(r => r.nombre === rec);
        if (receta) {
          receta.ingredientes.forEach(({ nombre, unidad, cantidad }) => {
            const clave = `${nombre.trim().toLowerCase()}-${unidad.trim().toLowerCase()}`;
            if (!ingredientesTotales[clave]) ingredientesTotales[clave] = 0;
            ingredientesTotales[clave] += cantidad * comensales;
          });
        }
      });
    });

    const lista = Object.entries(ingredientesTotales).map(([clave, cantidad]) => {
      const [nombre, unidad] = clave.split("-");
      return {
        nombre,
        unidad: cantidad >= 1000 ? (unidad === "ml" ? "l" : unidad === "g" ? "kg" : unidad) : unidad,
        cantidad: cantidad >= 1000 ? cantidad / 1000 : cantidad,
      };
    });

    setResultado(lista);
  };

  const descargarExcelPedido = () => {
    const ws = XLSX.utils.json_to_sheet(resultado);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido");
    XLSX.writeFile(wb, "pedido_comedor.xlsx");
  };

  // ========== REGISTRO MENSUAL ==========
  // Maneja los cambios de la tabla
  const handleSemanaChange = (semanaIdx, diaIdx, field, value) => {
    const nuevasSemanas = semanas.map((sem, i) =>
      i !== semanaIdx
        ? sem
        : sem.map((dia, j) =>
            j !== diaIdx ? dia : { ...dia, [field]: value }
          )
    );
    setSemanas(nuevasSemanas);
  };

  // Cuando cambia la receta seleccionada, muestra ingredientes para cargar cantidad usada manualmente
  const handleIngredientesUsados = (semanaIdx, diaIdx, nombreIng, value) => {
    const nuevasSemanas = semanas.map((sem, i) =>
      i !== semanaIdx
        ? sem
        : sem.map((dia, j) =>
            j !== diaIdx
              ? dia
              : {
                  ...dia,
                  ingredientesUsados: {
                    ...dia.ingredientesUsados,
                    [nombreIng]: value,
                  },
                }
          )
    );
    setSemanas(nuevasSemanas);
  };

  // Exporta la planilla de registro mensual en Excel (similar formato al tuyo)
  const descargarExcelRegistro = () => {
    // Prepara todas las filas: una por cada día (semana x día), luego suma mensual
    let datos = [];
    semanas.forEach((semana, semanaIdx) => {
      semana.forEach((dia, diaIdx) => {
        const fila = {
          Semana: semanaIdx + 1,
          Día: DIAS[diaIdx],
          Fecha: dia.fecha,
          Adultos: dia.adultos,
          Niños: dia.ninos,
          Principal: dia.principal,
          Acompañamiento: dia.acompañamiento,
          Postre: dia.postre,
        };
        // Agrega ingredientes usados como columnas
        recetas.forEach((rec) => {
          (rec.ingredientes || []).forEach((ing) => {
            const key = ing.nombre;
            if (!(key in fila)) fila[key] = "";
            // Si ese día el usuario lo usó, suma la cantidad
            if (dia.ingredientesUsados && dia.ingredientesUsados[key])
              fila[key] = dia.ingredientesUsados[key];
          });
        });
        datos.push(fila);
      });
    });

    // Agrega suma mensual al final
    const suma = calcularSumaMensual(semanas, recetas);
    const filaSuma = { Semana: "", Día: "TOTAL MES" };
    Object.keys(suma).forEach(ing => {
      filaSuma[ing] = suma[ing];
    });
    datos.push(filaSuma);

    // Exporta
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registro Mensual");
    XLSX.writeFile(wb, "registro_mensual_comedor.xlsx");
  };

  // ========== RECETAS LOGIC (igual que antes) ==========
  const handleModificarIngrediente = (index, field, value) => {
    const receta = recetaEditando !== null ? { ...nuevaReceta } : { ...nuevaReceta };
    receta.ingredientes[index][field] = field === "cantidad" ? Number(value) : value;
    setNuevaReceta(receta);
  };

  const handleAgregarIngrediente = () => {
    setNuevaReceta({
      ...nuevaReceta,
      ingredientes: [
        ...nuevaReceta.ingredientes,
        { nombre: "", unidad: "g", cantidad: 0 },
      ],
    });
  };

  const handleGuardarReceta = () => {
    if (recetaEditando !== null) {
      const nuevas = [...recetas];
      nuevas[recetaEditando] = { ...nuevaReceta };
      setRecetas(nuevas);
      setRecetaEditando(null);
    } else {
      setRecetas([...recetas, nuevaReceta]);
      setNuevaReceta({
        nombre: "",
        tipo: "principal",
        ingredientes: [{ nombre: "", unidad: "g", cantidad: 0 }],
      });
    }
  };

  const editarReceta = (index) => {
    setRecetaEditando(index);
    setNuevaReceta({ ...recetas[index] });
  };

  const eliminarReceta = (nombre) => {
    setRecetas(recetas.filter((r) => r.nombre !== nombre));
    if (recetaEditando !== null) setRecetaEditando(null);
  };

  if (!usuario) {
    return <Login onLogin={() => {}} />;
  }

  // ========= INTERFAZ =========
  return (
    <div style={{ background: "#23272f", minHeight: "100vh", color: "#fafafa", fontFamily: "sans-serif", padding: 30 }}>
      <button onClick={() => signOut(auth)} style={{ float: "right", marginBottom: 10, background: "#444", color: "#fff", borderRadius: 10, padding: "6px 20px" }}>
        🚪 Cerrar sesión
      </button>
      <h1 style={{ color: "#fff", fontSize: "2em", letterSpacing: 2, marginBottom: 20 }}>
        🍽️ App Comedor Escolar
      </h1>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => setTab("pedidos")}
          style={{
            background: tab === "pedidos" ? "#4060c8" : "#1e2533",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 20px",
            fontWeight: "bold"
          }}
        >Pedidos</button>
        <button
          onClick={() => setTab("registro")}
          style={{
            background: tab === "registro" ? "#4060c8" : "#1e2533",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 20px",
            fontWeight: "bold"
          }}
        >Registro mensual</button>
      </div>

      {/* --- PESTAÑA PEDIDOS --- */}
      {tab === "pedidos" && (
        <>
          {/* Menú semanal */}
          <h2 style={{ marginTop: 10 }}>📅 Menú semanal</h2>
          <div style={{ marginBottom: 20 }}>
            <label>📆 Ver pedido de:</label>
            <select value={filtroDia} onChange={(e) => setFiltroDia(e.target.value)} style={{ marginLeft: 10 }}>
              <option value="semana">Toda la semana</option>
              {Object.keys(menu).map((dia) => (
                <option key={dia} value={dia}>{dia.charAt(0).toUpperCase() + dia.slice(1)}</option>
              ))}
            </select>
          </div>
          {Object.keys(menu).map((dia) => (
            <div key={dia} style={{ marginBottom: 10 }}>
              <strong>{dia.toUpperCase()}:</strong>
              {["principal", "acompañamiento", "postre"].map((tipo) => (
                <select
                  key={tipo}
                  value={menu[dia][tipo]}
                  onChange={(e) =>
                    setMenu({
                      ...menu,
                      [dia]: { ...menu[dia], [tipo]: e.target.value },
                    })
                  }
                  style={{ marginLeft: 5, marginRight: 10 }}
                >
                  <option value="">-- {tipo} --</option>
                  {recetas.filter((r) => r.tipo === tipo).map((r, idx) => (
                    <option key={idx} value={r.nombre}>{r.nombre}</option>
                  ))}
                </select>
              ))}
            </div>
          ))}

          {/* Pedido y calculadora */}
          <div style={{ marginTop: 20 }}>
            <label>👥 Comensales:</label>
            <input type="number" value={comensales} onChange={(e) => setComensales(Number(e.target.value))} style={{ marginLeft: 10, borderRadius: 5, padding: 4 }} />
            <button onClick={calcularPedido} style={{ marginLeft: 10, background: "#3c8f4a", color: "#fff", borderRadius: 7, padding: "7px 18px", fontWeight: 600 }}>🧮 Calcular pedido</button>
          </div>
          {resultado.length > 0 && (
            <div style={{ marginTop: 30 }}>
              <h3 style={{ marginTop: 0 }}>📦 Ingredientes Totales</h3>
              <table style={{ borderCollapse: "collapse", width: "100%", background: "#292d37", borderRadius: 12, color: "#fafafa" }}>
                <thead>
                  <tr>
                    <th style={{ border: "1px solid #888", padding: 8 }}>Ingrediente</th>
                    <th style={{ border: "1px solid #888", padding: 8 }}>Cantidad</th>
                    <th style={{ border: "1px solid #888", padding: 8 }}>Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.map((r, i) => (
                    <tr key={i}>
                      <td style={{ border: "1px solid #333", padding: 8 }}>{r.nombre}</td>
                      <td style={{ border: "1px solid #333", padding: 8 }}>{r.cantidad}</td>
                      <td style={{ border: "1px solid #333", padding: 8 }}>{r.unidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={descargarExcelPedido} style={{ marginTop: 10, background: "#2072bc", color: "#fff", borderRadius: 8, padding: "7px 22px" }}>⬇️ Descargar Excel</button>
            </div>
          )}

          {/* --- Carga y edición de recetas --- */}
          <hr style={{ margin: "32px 0", border: 0, borderTop: "1px solid #333" }} />
          <h2>➕ Agregar/Editar Receta</h2>
          <input
            placeholder="Nombre de la receta"
            value={nuevaReceta.nombre}
            onChange={(e) => setNuevaReceta({ ...nuevaReceta, nombre: e.target.value })}
            style={{ marginRight: 10, borderRadius: 5, padding: 5 }}
          />
          <select
            value={nuevaReceta.tipo}
            onChange={(e) => setNuevaReceta({ ...nuevaReceta, tipo: e.target.value })}
          >
            <option value="principal">Principal</option>
            <option value="acompañamiento">Acompañamiento</option>
            <option value="postre">Postre</option>
            <option value="fruta">Fruta</option>
          </select>
          {nuevaReceta.ingredientes.map((ing, i) => (
            <div key={i} style={{ marginTop: 4 }}>
              <input
                placeholder="Ingrediente"
                value={ing.nombre}
                onChange={(e) => handleModificarIngrediente(i, "nombre", e.target.value)}
                style={{ marginRight: 5, borderRadius: 5, padding: 4 }}
              />
              <input
                placeholder="Unidad"
                value={ing.unidad}
                onChange={(e) => handleModificarIngrediente(i, "unidad", e.target.value)}
