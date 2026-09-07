// Share existing translations with the native client; never execute application code.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(root, 'android/app/src/main/assets');
function literal(node) {
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return literal(node.expression);
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return ts.isStringLiteral(node) ? node.text : Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => {
    if (!ts.isPropertyAssignment(p)) throw Error('Only static property assignments are supported');
    return [p.name.text, literal(p.initializer)];
  }));
  throw Error(`Non-literal resource node: ${ts.SyntaxKind[node.kind]}`);
}
function read(file, variable) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) === variable) return literal(declaration.initializer);
    }
  }
  throw Error(`Missing ${variable} in ${file}`);
}
const resources = {
  'translations.json': { zh: read('lib/i18n.ts', 'zh'), en: read('lib/i18n.ts', 'en') },
  'menu-translations.json': read('lib/menu-text.ts', 'pairs'),
  'server-errors.json': read('lib/client-api.ts', 'serverErrorEn'),
  'permissions.json': read('app/manage/rbac/page.tsx', 'PERMISSION_META'),
  'admin-defaults.json': {
    groups: read('app/admin/menu/page.tsx', 'GROUP_OPTIONS'),
    categories: read('app/admin/menu/page.tsx', 'DEFAULT_CATEGORY_OPTIONS'),
    sort: read('app/admin/menu/page.tsx', 'SORT_OPTIONS'),
  },
};
for (const [name, value] of Object.entries(resources)) {
  const output = JSON.stringify(value, null, 2) + '\n';
  const file = path.join(target, name);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== output) throw Error(`${name} is stale; run node scripts/android/sync-resources.mjs`);
  } else {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(file, output);
  }
}
console.log(`${Object.keys(resources).length} Android resource catalogs ${process.argv.includes('--check') ? 'verified' : 'generated'}`);
