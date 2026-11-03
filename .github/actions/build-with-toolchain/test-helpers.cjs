const assert = require("node:assert/strict");
const fs = require("node:fs");

function step(file, name, expressions = {}) {
  const text = fs.readFileSync(file, "utf8");
  const marker = `    - name: ${name}\n`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `Missing step: ${name}`);
  const run = text.indexOf("      run: |\n", start);
  assert.notEqual(run, -1, `Missing script: ${name}`);
  const lines = text.slice(run + "      run: |\n".length).split("\n");
  const script = [];
  for (const line of lines) {
    if (line === "") {
      script.push("");
    } else if (line.startsWith("        ")) {
      script.push(line.slice(8));
    } else {
      break;
    }
  }
  return script.join("\n").replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) => {
    assert.ok(Object.hasOwn(expressions, expression), `Unknown expression: ${expression}`);
    return expressions[expression];
  });
}

module.exports = { step };
