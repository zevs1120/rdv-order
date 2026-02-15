const crypto = require("crypto");

const pin = process.argv[2];
if (!pin) {
  console.error("Usage: node scripts/gen-pin.js <pin>");
  process.exit(1);
}

const salt = crypto.randomBytes(8).toString("hex");
const hash = crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");

console.log(`pin_salt=${salt}`);
console.log(`pin_hash=${hash}`);
