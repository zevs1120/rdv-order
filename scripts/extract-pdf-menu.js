const { PDFParse } = require('pdf-parse');

async function run(file) {
  const parser = new PDFParse({ url: file });
  const result = await parser.getText();
  console.log(`===== ${file} =====`);
  console.log(result.text.slice(0, 120000));
  await parser.destroy();
}

(async () => {
  for (const f of process.argv.slice(2)) {
    await run(f);
  }
})();
