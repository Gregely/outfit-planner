// A tiny OpenAI-compatible server for end-to-end tests: deterministic answers, no keys, no
// network. It reads the JSON schema each request asks for and answers in that shape, picking
// garment ids from the wardrobe listed in the prompt – so the app's own validation decides
// what's accepted, exactly as with a real model.
// Usage: node scripts/e2e-mock-ai.mjs [port]
import http from "node:http";

const port = Number(process.argv[2] ?? 3299);
const MODEL = "mock-stylist";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", ...cors });
  res.end(JSON.stringify(body));
}

/** "#12 Name | tops/t-shirt (top) | …" → { id, slot } */
function garments(prompt) {
  return [...prompt.matchAll(/^#(\d+) [^|]+\| [^(]+\((\w+)\)/gm)].map((m) => ({ id: Number(m[1]), slot: m[2] }));
}

function outfit(prompt, name) {
  const gs = garments(prompt);
  const first = (slot) => gs.find((g) => g.slot === slot)?.id;
  const ids = [first("top"), first("bottom"), first("footwear")].filter((x) => x !== undefined);
  return { name, garment_ids: ids, explanation: "A simple, comfortable combination from the mock stylist." };
}

function answer(schema, prompt) {
  const props = schema?.properties ?? {};
  if ("status" in props) return { status: "ok", garment: "black polyester running shorts", category: "shorts" };
  if ("outfits" in props) return { outfits: [outfit(prompt, "Mock look")] };
  if ("days" in props) {
    const dates = [...prompt.matchAll(/^DATE: (\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]);
    return { days: dates.map((date) => ({ date, ...outfit(prompt, "Mock day") })) };
  }
  if ("alternatives" in props) return { alternatives: [] };
  if ("gaps" in props) return { gaps: [] };
  if ("activities" in props) return { activities: [] };
  if ("garments" in props) return { garments: [] };
  return {};
}

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.method === "GET" && req.url === "/v1/models") return send(res, 200, { object: "list", data: [{ id: MODEL, object: "model" }] });
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        if (body.model !== MODEL) return send(res, 404, { error: { message: `The model \`${body.model}\` does not exist.`, type: "invalid_request_error", code: "model_not_found" } });
        const schema = body.response_format?.json_schema?.schema;
        const prompt = (body.messages ?? []).map((m) => m.content).join("\n");
        send(res, 200, {
          id: "chat_mock",
          object: "chat.completion",
          created: 0,
          model: MODEL,
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(answer(schema, prompt)) }, finish_reason: "stop" }],
        });
      });
      return;
    }
    send(res, 404, { error: { message: "Not found" } });
  })
  .listen(port, "127.0.0.1", () => console.log(`mock AI server on http://127.0.0.1:${port}/v1`));
