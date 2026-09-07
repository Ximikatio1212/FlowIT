type NetlifyEvent = { httpMethod?: string };

export async function handler(event: NetlifyEvent) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { "access-control-allow-origin": "*" },
      body: "",
    };
  }

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify({ status: "ok" }),
  };
}