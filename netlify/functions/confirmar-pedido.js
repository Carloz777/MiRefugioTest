
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  const responder = (statusCode, datos) => ({
    statusCode,
    headers,
    body: JSON.stringify(datos)
  });

  if (event.httpMethod !== "POST") {
    return responder(405, {
      success: false,
      error: "Método no permitido"
    });
  }

  const scriptUrl = process.env.MIREFUGIO_SCRIPT_URL;
  const apiKey = process.env.MIREFUGIO_API_KEY;

  if (!scriptUrl || !apiKey) {
    return responder(503, {
      success: false,
      error: "Servidor TEST sin configurar"
    });
  }

  try {
    const data = JSON.parse(event.body || "{}");

    if (
      typeof data.pedidoId !== "string" ||
      !data.pedidoId.trim() ||
      data.pedidoId.trim().length > 100 ||
      !Array.isArray(data.items) ||
      data.items.length === 0 ||
      data.items.length > 50
    ) {
      return responder(400, {
        success: false,
        error: "Pedido inválido"
      });
    }

    const items = data.items.map((item) => ({
      nombre: item?.nombre,
      cantidad: item?.cantidad
    }));

    for (const item of items) {
      if (
        typeof item.nombre !== "string" ||
        !item.nombre.trim() ||
        item.nombre.length > 150 ||
        !Number.isInteger(item.cantidad) ||
        item.cantidad <= 0 ||
        item.cantidad > 100
      ) {
        return responder(400, {
          success: false,
          error: "Producto o cantidad inválida"
        });
      }
    }

    // Evitar productos repetidos en un mismo pedido.
    const nombres = items.map(item => item.nombre.trim());

    if (new Set(nombres).size !== nombres.length) {
      return responder(400, {
        success: false,
        error: "El pedido contiene productos repetidos"
      });
    }

    // Enviar el pedido validado a Google Apps Script TEST.
    const respuesta = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        apiKey,
        pedidoId: data.pedidoId.trim(),
        items
      }),
      redirect: "follow",
      signal: AbortSignal.timeout(20000)
    });

    if (!respuesta.ok) {
      throw new Error("Apps Script no respondió correctamente");
    }

    const resultado = await respuesta.json();

    if (resultado.success !== true) {
      return responder(409, {
        success: false,
        error: resultado.error || "No se pudo confirmar el pedido"
      });
    }

    return responder(200, {
      success: true,
      pedidoId: data.pedidoId.trim(),
      duplicado: resultado.duplicado === true
    });

  } catch (error) {
    console.error("Error confirmando pedido:", error.message);

    return responder(502, {
      success: false,
      error: "No se pudo confirmar el pedido. Verificá su estado antes de reintentar."
    });
  }
};
