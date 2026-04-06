exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { email, code } = JSON.parse(event.body || "{}");
    if (!email || !code) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Нужны поля email и code." }),
      };
    }

    const apiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.BREVO_FROM_EMAIL;
    const fromName = process.env.BREVO_FROM_NAME || "Revolver";

    if (!apiKey || !fromEmail) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Не заданы BREVO_API_KEY или BREVO_FROM_EMAIL в Netlify Environment Variables.",
        }),
      };
    }

    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email }],
        subject: "Код подтверждения Revolver",
        htmlContent:
          "<h3>Подтверждение регистрации Revolver</h3>" +
          `<p>Ваш код подтверждения: <strong>${String(code)}</strong></p>` +
          "<p>Код действует 10 минут.</p>",
      }),
    });

    if (!brevoResponse.ok) {
      const text = await brevoResponse.text();
      return {
        statusCode: brevoResponse.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Brevo error: ${text || "unknown error"}`,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `Function crash: ${err && err.message ? err.message : "unknown error"}`,
      }),
    };
  }
};

